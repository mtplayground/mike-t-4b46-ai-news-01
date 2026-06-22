use std::{error::Error, fmt, sync::Arc};

use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts, StatusCode},
    response::{IntoResponse, Response},
};
use jsonwebtoken::{
    decode, decode_header,
    jwk::{Jwk, JwkSet},
    Algorithm, DecodingKey, Validation,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::{
    config::AuthConfig,
    db::{Database, DbError},
    models,
    state::AppState,
};

const MCTAI_SESSION_COOKIE: &str = "mctai_session";

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
    pub fn new(config: AuthConfig, database: Database) -> Self {
        Self {
            app_token: config.app_token,
            auth_url: config.url,
            database,
            http_client: Client::new(),
            jwks_cache: Arc::new(RwLock::new(None)),
            jwks_url: config.jwks_url,
        }
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
            Some(value.to_owned())
        } else {
            None
        }
    })
}
