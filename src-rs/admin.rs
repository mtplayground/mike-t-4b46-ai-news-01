use std::{collections::HashMap, error::Error, fmt};

use axum::{
    body::Bytes,
    extract::{Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Duration, Utc};
use getrandom::fill as fill_random;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

use crate::{
    db::{Database, DbError},
    models::{User, UserRole},
    state::AppState,
};

const ADMIN_SESSION_COOKIE: &str = "admin_session";
const ADMIN_SESSION_TTL_SECONDS: i64 = 12 * 60 * 60;

#[derive(Clone)]
pub struct AdminAuth {
    database: Database,
    password_hash: [u8; 32],
    secure_cookies: bool,
}

#[derive(Debug)]
pub enum AdminAuthError {
    Database(DbError),
    Random(getrandom::Error),
}

#[derive(Debug, Deserialize)]
struct LoginRequest {
    password: Option<String>,
}

#[derive(Debug, Serialize)]
struct AdminSessionResponse {
    authenticated: bool,
    user: Option<AdminUserResponse>,
}

#[derive(Debug, Serialize)]
struct AdminUserResponse {
    email: String,
    name: Option<String>,
    role: &'static str,
    sub: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/login", post(login))
        .route("/api/admin/logout", post(logout))
        .route("/api/admin/session", get(session))
}

impl AdminAuth {
    pub fn new(admin_password: String, database: Database, secure_cookies: bool) -> Self {
        Self {
            database,
            password_hash: sha256_bytes(admin_password.as_bytes()),
            secure_cookies,
        }
    }

    pub fn verify_password(&self, candidate: &str) -> bool {
        if candidate.is_empty() {
            return false;
        }

        sha256_bytes(candidate.as_bytes())
            .ct_eq(&self.password_hash)
            .into()
    }

    pub async fn create_session(&self) -> Result<CreatedAdminSession, AdminAuthError> {
        let token = generate_session_token()?;
        let token_hash = hash_token(&token);
        let expires = Utc::now() + Duration::seconds(ADMIN_SESSION_TTL_SECONDS);
        let user = self.database.ensure_admin_user().await?;

        self.database.delete_expired_admin_sessions().await?;
        let session = self
            .database
            .create_admin_session(&token_hash, &user.sub, expires)
            .await?;

        Ok(CreatedAdminSession {
            expires,
            session,
            token,
            user,
        })
    }

    pub async fn get_session(
        &self,
        token: Option<&str>,
    ) -> Result<Option<PersistedAdminSession>, AdminAuthError> {
        let Some(token) = token else {
            return Ok(None);
        };
        let token_hash = hash_token(token);
        let Some((session, user)) = self.database.admin_session_by_hash(&token_hash).await? else {
            return Ok(None);
        };

        if session.expires <= Utc::now() {
            self.database
                .delete_admin_session_by_hash(&token_hash)
                .await?;
            return Ok(None);
        }

        if user.role != UserRole::Admin {
            return Ok(None);
        }

        Ok(Some(PersistedAdminSession {
            expires: session.expires,
            session,
            user,
        }))
    }

    pub async fn authenticate_cookie_header(
        &self,
        cookie_header: Option<&str>,
    ) -> Result<Option<PersistedAdminSession>, AdminAuthError> {
        let token = cookie_header.and_then(admin_session_token_from_cookie_header);

        self.get_session(token.as_deref()).await
    }

    pub async fn delete_session(&self, token: Option<&str>) -> Result<(), AdminAuthError> {
        if let Some(token) = token {
            self.database
                .delete_admin_session_by_hash(&hash_token(token))
                .await?;
        }

        Ok(())
    }

    fn session_cookie(&self, token: &str, expires: DateTime<Utc>) -> String {
        let max_age = (expires - Utc::now()).num_seconds().max(0);
        format_cookie(token, max_age, self.secure_cookies)
    }

    fn clear_cookie(&self) -> String {
        format_cookie("", 0, self.secure_cookies)
    }
}

impl fmt::Display for AdminAuthError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Database(error) => write!(formatter, "database error during admin auth: {error}"),
            Self::Random(error) => write!(formatter, "secure random generation failed: {error}"),
        }
    }
}

impl Error for AdminAuthError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Database(error) => Some(error),
            Self::Random(_) => None,
        }
    }
}

impl From<DbError> for AdminAuthError {
    fn from(error: DbError) -> Self {
        Self::Database(error)
    }
}

impl From<getrandom::Error> for AdminAuthError {
    fn from(error: getrandom::Error) -> Self {
        Self::Random(error)
    }
}

#[allow(dead_code)]
pub struct CreatedAdminSession {
    pub expires: DateTime<Utc>,
    pub session: crate::models::Session,
    pub token: String,
    pub user: User,
}

#[allow(dead_code)]
pub struct PersistedAdminSession {
    pub expires: DateTime<Utc>,
    pub session: crate::models::Session,
    pub user: User,
}

async fn login(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    let wants_redirect = !is_json_request(&headers);
    let password = read_password(&headers, &body);

    if !state.admin.verify_password(&password) {
        if wants_redirect {
            return redirect_response(StatusCode::SEE_OTHER, "/sign-in?error=admin");
        }

        return (
            StatusCode::UNAUTHORIZED,
            Json(AdminSessionResponse {
                authenticated: false,
                user: None,
            }),
        )
            .into_response();
    }

    match state.admin.create_session().await {
        Ok(admin_session) => {
            let mut headers = HeaderMap::new();
            if let Ok(cookie) = HeaderValue::from_str(
                &state
                    .admin
                    .session_cookie(&admin_session.token, admin_session.expires),
            ) {
                headers.insert(header::SET_COOKIE, cookie);
            }

            if wants_redirect {
                let return_to = safe_return_to(query.get("return_to").map(String::as_str));
                if let Ok(location) = HeaderValue::from_str(&return_to) {
                    headers.insert(header::LOCATION, location);
                }

                return (StatusCode::SEE_OTHER, headers).into_response();
            }

            (
                StatusCode::OK,
                headers,
                Json(AdminSessionResponse {
                    authenticated: true,
                    user: Some(AdminUserResponse::from_user(admin_session.user)),
                }),
            )
                .into_response()
        }
        Err(error) => admin_server_error(error),
    }
}

async fn logout(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let token = admin_session_token_from_headers(&headers);

    match state.admin.delete_session(token.as_deref()).await {
        Ok(()) => {
            let mut headers = HeaderMap::new();
            if let Ok(cookie) = HeaderValue::from_str(&state.admin.clear_cookie()) {
                headers.insert(header::SET_COOKIE, cookie);
            }

            (
                StatusCode::OK,
                headers,
                Json(AdminSessionResponse {
                    authenticated: false,
                    user: None,
                }),
            )
                .into_response()
        }
        Err(error) => admin_server_error(error),
    }
}

async fn session(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let token = admin_session_token_from_headers(&headers);

    match state.admin.get_session(token.as_deref()).await {
        Ok(Some(admin_session)) => Json(AdminSessionResponse {
            authenticated: true,
            user: Some(AdminUserResponse::from_user(admin_session.user)),
        })
        .into_response(),
        Ok(None) => Json(AdminSessionResponse {
            authenticated: false,
            user: None,
        })
        .into_response(),
        Err(error) => admin_server_error(error),
    }
}

impl AdminUserResponse {
    fn from_user(user: User) -> Self {
        Self {
            email: user.email,
            name: user.name,
            role: match user.role {
                UserRole::Admin => "ADMIN",
                UserRole::User => "USER",
            },
            sub: user.sub,
        }
    }
}

fn admin_server_error(error: AdminAuthError) -> axum::response::Response {
    tracing::error!(error = ?error, message = %error, "admin auth endpoint failed");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(AdminSessionResponse {
            authenticated: false,
            user: None,
        }),
    )
        .into_response()
}

fn is_json_request(headers: &HeaderMap) -> bool {
    headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|content_type| content_type.contains("application/json"))
}

fn safe_return_to(value: Option<&str>) -> String {
    let Some(value) = value else {
        return "/admin".to_owned();
    };

    if value.starts_with('/') && !value.starts_with("/api/") && !value.starts_with("//") {
        value.to_owned()
    } else {
        "/admin".to_owned()
    }
}

fn redirect_response(status: StatusCode, location: &str) -> axum::response::Response {
    let mut headers = HeaderMap::new();
    if let Ok(location) = HeaderValue::from_str(location) {
        headers.insert(header::LOCATION, location);
    }

    (status, headers).into_response()
}

fn read_password(headers: &HeaderMap, body: &[u8]) -> String {
    if is_json_request(headers) {
        return serde_json::from_slice::<LoginRequest>(body)
            .ok()
            .and_then(|request| request.password)
            .unwrap_or_default();
    }

    url::form_urlencoded::parse(body)
        .find_map(|(name, value)| (name == "password").then(|| value.into_owned()))
        .unwrap_or_default()
}

fn admin_session_token_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(admin_session_token_from_cookie_header)
}

fn admin_session_token_from_cookie_header(cookie_header: &str) -> Option<String> {
    cookie_header.split(';').find_map(|part| {
        let (name, value) = part.trim().split_once('=')?;

        if name == ADMIN_SESSION_COOKIE && !value.is_empty() {
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

fn format_cookie(value: &str, max_age_seconds: i64, secure: bool) -> String {
    let expires = if max_age_seconds <= 0 {
        "Thu, 01 Jan 1970 00:00:00 GMT".to_owned()
    } else {
        httpdate::fmt_http_date(
            (std::time::SystemTime::now() + std::time::Duration::from_secs(max_age_seconds as u64))
                .into(),
        )
    };
    let secure = if secure { "; Secure" } else { "" };

    format!(
        "{ADMIN_SESSION_COOKIE}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age_seconds}; Expires={expires}{secure}"
    )
}

fn generate_session_token() -> Result<String, AdminAuthError> {
    let mut bytes = [0_u8; 32];
    fill_random(&mut bytes)?;
    Ok(hex::encode(bytes))
}

fn hash_token(token: &str) -> String {
    hex::encode(sha256_bytes(token.as_bytes()))
}

fn sha256_bytes(value: &[u8]) -> [u8; 32] {
    let digest = Sha256::digest(value);
    let mut bytes = [0_u8; 32];
    bytes.copy_from_slice(&digest);
    bytes
}

#[cfg(test)]
mod tests {
    use crate::{
        config::{AuthConfig, ObjectStorageConfig, ServerConfig},
        db::Database,
    };

    use super::*;

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

    #[test]
    fn extracts_and_decodes_admin_session_cookies() {
        let cookie_header = "admin_session=admin%2Ftoken; mctai_session=user-token";

        assert_eq!(
            admin_session_token_from_cookie_header(cookie_header),
            Some("admin/token".to_owned())
        );
        assert_eq!(admin_session_token_from_cookie_header("not-a-cookie"), None);
        assert_eq!(
            admin_session_token_from_cookie_header("admin_session="),
            None
        );
    }

    #[tokio::test]
    async fn verifies_admin_passwords_without_accepting_blank_values() {
        let auth = AdminAuth::new("test-admin-password".to_owned(), test_database(), false);

        assert!(!auth.verify_password(""));
        assert!(!auth.verify_password("wrong-password"));
        assert!(auth.verify_password("test-admin-password"));
    }

    #[tokio::test]
    async fn formats_session_cookie_security_attributes() {
        let auth = AdminAuth::new("test-admin-password".to_owned(), test_database(), true);
        let expires = Utc::now() + Duration::minutes(5);
        let cookie = auth.session_cookie("token", expires);

        assert!(cookie.starts_with("admin_session=token; Path=/; HttpOnly; SameSite=Lax;"));
        assert!(cookie.contains("Max-Age="));
        assert!(cookie.ends_with("; Secure"));
    }
}
