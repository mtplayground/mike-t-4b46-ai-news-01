use std::{error::Error, fmt, sync::Arc};

use axum::{
    extract::{FromRequestParts, Query, State},
    http::{header, request::Parts, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Redirect, Response},
    routing::get,
    Json, Router,
};
use jsonwebtoken::{
    decode, decode_header,
    jwk::{Jwk, JwkSet},
    Algorithm, DecodingKey, Validation,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use url::Url;

use crate::{
    config::AuthConfig,
    db::{Database, DbError},
    models::{self, UserRole},
    state::AppState,
};

const MCTAI_SESSION_COOKIE: &str = "mctai_session";

#[derive(Debug, Deserialize)]
struct LoginQuery {
    return_to: Option<String>,
}

#[derive(Debug, Serialize)]
struct AuthSessionResponse {
    authenticated: bool,
    user: Option<AuthUserResponse>,
}

#[derive(Debug, Serialize)]
struct AuthUserResponse {
    email: String,
    #[serde(rename = "emailVerified")]
    email_verified: bool,
    name: Option<String>,
    #[serde(rename = "pictureUrl")]
    picture_url: Option<String>,
    role: &'static str,
    sub: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/login", get(login))
        .route("/api/auth/logout", get(logout_get).post(logout_post))
        .route("/api/auth/session", get(session))
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MctaiSessionClaims {
    pub aud: serde_json::Value,
    pub email: String,
    #[serde(default)]
    pub email_verified: bool,
    pub exp: usize,
    pub iat: Option<usize>,
    pub iss: String,
    pub name: Option<String>,
    pub picture: Option<String>,
    pub sub: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct AuthenticatedActor {
    pub claims: MctaiSessionClaims,
    pub user: models::User,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct OptionalAuthenticatedActor(pub Option<AuthenticatedActor>);

#[derive(Clone)]
pub struct AuthVerifier {
    app_token: String,
    auth_url: String,
    database: Database,
    http_client: Client,
    jwks_cache: Arc<RwLock<Option<JwkSet>>>,
    jwks_url: String,
    secure_cookies: bool,
    self_url: String,
}

#[derive(Debug)]
pub enum AuthError {
    Database(DbError),
    InvalidClaims(&'static str),
    InvalidToken(String),
    JwksFetch(String),
    MissingSessionCookie,
    MissingSigningKey,
    UnsupportedAlgorithm(Algorithm),
}

#[derive(Debug)]
pub struct AuthRejection {
    status: StatusCode,
    message: &'static str,
}

impl fmt::Display for AuthError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Database(error) => write!(formatter, "database error during auth: {error}"),
            Self::InvalidClaims(message) => write!(formatter, "invalid session claims: {message}"),
            Self::InvalidToken(message) => write!(formatter, "invalid session token: {message}"),
            Self::JwksFetch(message) => write!(formatter, "failed to fetch JWKS: {message}"),
            Self::MissingSessionCookie => formatter.write_str("missing mctai_session cookie"),
            Self::MissingSigningKey => formatter.write_str("session signing key not found in JWKS"),
            Self::UnsupportedAlgorithm(algorithm) => {
                write!(
                    formatter,
                    "unsupported JWT signing algorithm: {algorithm:?}"
                )
            }
        }
    }
}

impl Error for AuthError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Database(error) => Some(error),
            _ => None,
        }
    }
}

impl From<DbError> for AuthError {
    fn from(error: DbError) -> Self {
        Self::Database(error)
    }
}

impl AuthVerifier {
    pub fn new(
        config: AuthConfig,
        database: Database,
        self_url: String,
        secure_cookies: bool,
    ) -> Self {
        Self {
            app_token: config.app_token,
            auth_url: config.url,
            database,
            http_client: Client::new(),
            jwks_cache: Arc::new(RwLock::new(None)),
            jwks_url: config.jwks_url,
            secure_cookies,
            self_url,
        }
    }

    fn login_url(&self, return_to: Option<&str>) -> Result<Url, AuthError> {
        let auth_base = Url::parse(&self.auth_url)
            .map_err(|_| AuthError::InvalidClaims("MCTAI_AUTH_URL is not a valid URL"))?;
        let mut login_url = auth_base
            .join("/login")
            .map_err(|_| AuthError::InvalidClaims("unable to build auth login URL"))?;
        let return_to = self.frontend_return_url(return_to)?;

        login_url
            .query_pairs_mut()
            .append_pair("app_token", &self.app_token)
            .append_pair("return_to", return_to.as_str());

        Ok(login_url)
    }

    fn frontend_return_url(&self, return_to: Option<&str>) -> Result<Url, AuthError> {
        let self_url = Url::parse(&self.self_url)
            .map_err(|_| AuthError::InvalidClaims("SELF_URL is not a valid URL"))?;
        let candidate = return_to.filter(|value| !value.is_empty()).unwrap_or("/");
        let target = if candidate.starts_with('/') {
            self_url
                .join(candidate)
                .map_err(|_| AuthError::InvalidClaims("invalid return_to"))?
        } else {
            Url::parse(candidate).unwrap_or_else(|_| self_url.clone())
        };

        if target.origin().ascii_serialization() != self_url.origin().ascii_serialization()
            || target.path().starts_with("/api/")
        {
            return Ok(self_url);
        }

        Ok(target)
    }

    fn clear_cookie(&self) -> String {
        let secure = if self.secure_cookies { "; Secure" } else { "" };
        format!(
            "{MCTAI_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT{secure}"
        )
    }

    #[allow(dead_code)]
    pub async fn authenticate_cookie_header(
        &self,
        cookie_header: Option<&str>,
    ) -> Result<Option<AuthenticatedActor>, AuthError> {
        let Some(token) = session_token_from_cookie_header(cookie_header) else {
            return Ok(None);
        };

        let claims = self.verify_session_token(&token).await?;
        let user = self.database.sync_user_from_claims(&claims).await?;

        Ok(Some(AuthenticatedActor { claims, user }))
    }

    pub async fn require_cookie_header(
        &self,
        cookie_header: Option<&str>,
    ) -> Result<AuthenticatedActor, AuthError> {
        self.authenticate_cookie_header(cookie_header)
            .await?
            .ok_or(AuthError::MissingSessionCookie)
    }

    pub async fn verify_session_token(&self, token: &str) -> Result<MctaiSessionClaims, AuthError> {
        let header =
            decode_header(token).map_err(|error| AuthError::InvalidToken(error.to_string()))?;

        if header.alg != Algorithm::RS256 {
            return Err(AuthError::UnsupportedAlgorithm(header.alg));
        }

        let Some(kid) = header.kid else {
            return Err(AuthError::MissingSigningKey);
        };

        let jwk = self.signing_key(&kid).await?;
        let decoding_key = DecodingKey::from_jwk(&jwk)
            .map_err(|error| AuthError::InvalidToken(error.to_string()))?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_audience(&[self.app_token.as_str()]);
        validation.set_issuer(&[self.auth_url.as_str()]);

        let token_data = decode::<MctaiSessionClaims>(token, &decoding_key, &validation)
            .map_err(|error| AuthError::InvalidToken(error.to_string()))?;

        validate_claims(&token_data.claims)?;

        Ok(token_data.claims)
    }

    async fn signing_key(&self, kid: &str) -> Result<Jwk, AuthError> {
        if let Some(jwk) = self.cached_signing_key(kid).await {
            return Ok(jwk);
        }

        let jwks = self.fetch_jwks().await?;
        let jwk = jwks
            .find(kid)
            .cloned()
            .ok_or(AuthError::MissingSigningKey)?;

        *self.jwks_cache.write().await = Some(jwks);

        Ok(jwk)
    }

    async fn cached_signing_key(&self, kid: &str) -> Option<Jwk> {
        self.jwks_cache
            .read()
            .await
            .as_ref()
            .and_then(|jwks| jwks.find(kid).cloned())
    }

    async fn fetch_jwks(&self) -> Result<JwkSet, AuthError> {
        let response = self
            .http_client
            .get(&self.jwks_url)
            .send()
            .await
            .map_err(|error| AuthError::JwksFetch(error.to_string()))?;
        let response = response
            .error_for_status()
            .map_err(|error| AuthError::JwksFetch(error.to_string()))?;

        response
            .json::<JwkSet>()
            .await
            .map_err(|error| AuthError::JwksFetch(error.to_string()))
    }
}

async fn login(
    State(state): State<AppState>,
    Query(query): Query<LoginQuery>,
) -> impl IntoResponse {
    match state.auth.login_url(query.return_to.as_deref()) {
        Ok(url) => Redirect::temporary(url.as_str()).into_response(),
        Err(error) => auth_server_error(error),
    }
}

async fn logout_post(State(state): State<AppState>) -> impl IntoResponse {
    let mut headers = HeaderMap::new();
    if let Ok(cookie) = HeaderValue::from_str(&state.auth.clear_cookie()) {
        headers.insert(header::SET_COOKIE, cookie);
    }

    (
        StatusCode::OK,
        headers,
        Json(AuthSessionResponse {
            authenticated: false,
            user: None,
        }),
    )
        .into_response()
}

async fn logout_get(State(state): State<AppState>) -> impl IntoResponse {
    let mut headers = HeaderMap::new();
    if let Ok(cookie) = HeaderValue::from_str(&state.auth.clear_cookie()) {
        headers.insert(header::SET_COOKIE, cookie);
    }

    (StatusCode::SEE_OTHER, headers, [(header::LOCATION, "/")]).into_response()
}

async fn session(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let cookie_header = headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok());

    match state.auth.authenticate_cookie_header(cookie_header).await {
        Ok(Some(actor)) => Json(AuthSessionResponse {
            authenticated: true,
            user: Some(AuthUserResponse::from_user(actor.user)),
        })
        .into_response(),
        Ok(None)
        | Err(AuthError::InvalidClaims(_))
        | Err(AuthError::InvalidToken(_))
        | Err(AuthError::JwksFetch(_))
        | Err(AuthError::MissingSessionCookie)
        | Err(AuthError::MissingSigningKey)
        | Err(AuthError::UnsupportedAlgorithm(_)) => Json(AuthSessionResponse {
            authenticated: false,
            user: None,
        })
        .into_response(),
        Err(error @ AuthError::Database(_)) => auth_server_error(error),
    }
}

impl AuthUserResponse {
    fn from_user(user: models::User) -> Self {
        Self {
            email: user.email,
            email_verified: user.email_verified,
            name: user.name,
            picture_url: user.picture_url,
            role: match user.role {
                UserRole::Admin => "ADMIN",
                UserRole::User => "USER",
            },
            sub: user.sub,
        }
    }
}

fn auth_server_error(error: AuthError) -> Response {
    tracing::error!(error = ?error, message = %error, "auth endpoint failed");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(AuthSessionResponse {
            authenticated: false,
            user: None,
        }),
    )
        .into_response()
}

impl IntoResponse for AuthRejection {
    fn into_response(self) -> Response {
        (self.status, self.message).into_response()
    }
}

impl From<AuthError> for AuthRejection {
    fn from(error: AuthError) -> Self {
        match error {
            AuthError::Database(error) => {
                tracing::error!(error = ?error, message = %error, "failed to sync authenticated user");
                Self {
                    status: StatusCode::INTERNAL_SERVER_ERROR,
                    message: "Authentication failed",
                }
            }
            _ => Self {
                status: StatusCode::UNAUTHORIZED,
                message: "Authentication required",
            },
        }
    }
}

impl FromRequestParts<AppState> for AuthenticatedActor {
    type Rejection = AuthRejection;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let cookie_header = parts
            .headers
            .get(header::COOKIE)
            .and_then(|value| value.to_str().ok());

        state
            .auth
            .require_cookie_header(cookie_header)
            .await
            .map_err(AuthRejection::from)
    }
}

impl FromRequestParts<AppState> for OptionalAuthenticatedActor {
    type Rejection = AuthRejection;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let cookie_header = parts
            .headers
            .get(header::COOKIE)
            .and_then(|value| value.to_str().ok());

        state
            .auth
            .authenticate_cookie_header(cookie_header)
            .await
            .map(Self)
            .map_err(AuthRejection::from)
    }
}

fn validate_claims(claims: &MctaiSessionClaims) -> Result<(), AuthError> {
    if claims.sub.trim().is_empty() {
        return Err(AuthError::InvalidClaims("sub is required"));
    }

    if claims.email.trim().is_empty() {
        return Err(AuthError::InvalidClaims("email is required"));
    }

    if claims.iss.trim().is_empty() {
        return Err(AuthError::InvalidClaims("iss is required"));
    }

    Ok(())
}

fn session_token_from_cookie_header(cookie_header: Option<&str>) -> Option<String> {
    let cookie_header = cookie_header?;

    cookie_header.split(';').find_map(|part| {
        let (name, value) = part.trim().split_once('=')?;

        if name == MCTAI_SESSION_COOKIE && !value.is_empty() {
            Some(decode_cookie_value(value))
        } else {
            None
        }
    })
}

fn decode_cookie_value(value: &str) -> String {
    url::form_urlencoded::parse(format!("cookie={value}").as_bytes())
        .next()
        .map(|(_, decoded)| decoded.into_owned())
        .unwrap_or_else(|| value.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        config::{AuthConfig, ObjectStorageConfig, ServerConfig},
        db::Database,
    };

    fn test_database() -> Database {
        let config = ServerConfig {
            admin_password: "test-admin-password".to_owned(),
            auth: AuthConfig {
                app_token: "app-token".to_owned(),
                jwks_url: "https://auth.example.test/.well-known/jwks.json".to_owned(),
                url: "https://auth.example.test".to_owned(),
            },
            database_url: "postgres://user:password@localhost:5432/app".to_owned(),
            object_storage: ObjectStorageConfig {
                access_key_id: "access-key".to_owned(),
                bucket: "bucket".to_owned(),
                endpoint: "https://fly.storage.tigris.dev".to_owned(),
                force_path_style: true,
                prefix: "app_mike_t_4b46_ai_news_01_a92a65/".to_owned(),
                region: "auto".to_owned(),
                secret_access_key: "secret".to_owned(),
            },
            self_url: "https://app.example.test".to_owned(),
        };

        Database::connect(&config).expect("test database config should create a lazy pool")
    }

    fn verifier() -> AuthVerifier {
        AuthVerifier::new(
            AuthConfig {
                app_token: "app-token".to_owned(),
                jwks_url: "https://auth.example.test/.well-known/jwks.json".to_owned(),
                url: "https://auth.example.test".to_owned(),
            },
            test_database(),
            "https://app.example.test".to_owned(),
            true,
        )
    }

    fn claims(overrides: impl FnOnce(&mut MctaiSessionClaims)) -> MctaiSessionClaims {
        let mut claims = MctaiSessionClaims {
            aud: serde_json::json!("app-token"),
            email: "user@example.test".to_owned(),
            email_verified: true,
            exp: 4_102_444_800,
            iat: Some(1_700_000_000),
            iss: "https://auth.example.test".to_owned(),
            name: Some("User".to_owned()),
            picture: None,
            sub: "user-1".to_owned(),
        };
        overrides(&mut claims);
        claims
    }

    #[test]
    fn extracts_and_decodes_user_session_cookies() {
        let cookie_header = "theme=dark; mctai_session=token%20with%20spaces; ignored=value";

        assert_eq!(
            session_token_from_cookie_header(Some(cookie_header)),
            Some("token with spaces".to_owned())
        );
        assert_eq!(session_token_from_cookie_header(Some("theme=dark")), None);
        assert_eq!(session_token_from_cookie_header(None), None);
    }

    #[test]
    fn validates_required_session_claims() {
        assert!(validate_claims(&claims(|_| {})).is_ok());
        assert!(matches!(
            validate_claims(&claims(|claims| claims.sub = "   ".to_owned())),
            Err(AuthError::InvalidClaims("sub is required"))
        ));
        assert!(matches!(
            validate_claims(&claims(|claims| claims.email = "   ".to_owned())),
            Err(AuthError::InvalidClaims("email is required"))
        ));
        assert!(matches!(
            validate_claims(&claims(|claims| claims.iss = "   ".to_owned())),
            Err(AuthError::InvalidClaims("iss is required"))
        ));
    }

    #[tokio::test]
    async fn builds_login_url_with_safe_frontend_return_target() {
        let verifier = verifier();
        let url = verifier
            .login_url(Some("/profile?tab=settings"))
            .expect("login url should be built");

        assert_eq!(url.as_str(), "https://auth.example.test/login?app_token=app-token&return_to=https%3A%2F%2Fapp.example.test%2Fprofile%3Ftab%3Dsettings");
    }

    #[tokio::test]
    async fn rejects_api_or_cross_origin_return_targets() {
        let verifier = verifier();

        let api_url = verifier
            .login_url(Some("/api/auth/session"))
            .expect("login url should be built");
        assert!(api_url
            .as_str()
            .contains("return_to=https%3A%2F%2Fapp.example.test%2F"));

        let external_url = verifier
            .login_url(Some("https://evil.example.test/admin"))
            .expect("login url should be built");
        assert!(external_url
            .as_str()
            .contains("return_to=https%3A%2F%2Fapp.example.test%2F"));
    }

    #[tokio::test]
    async fn formats_logout_cookie_security_attributes() {
        let verifier = verifier();
        let cookie = verifier.clear_cookie();

        assert!(cookie.starts_with("mctai_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;"));
        assert!(cookie.ends_with("; Secure"));
    }
}
