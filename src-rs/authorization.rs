#![allow(dead_code)]

use std::{error::Error, fmt};

use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts, StatusCode},
    response::{IntoResponse, Response},
};

use crate::{
    admin::AdminAuthError,
    auth::{AuthError, AuthenticatedActor as MctaiAuthenticatedActor},
    models::{User, UserRole},
    state::AppState,
};

#[derive(Debug, Clone)]
pub struct Actor {
    pub user: User,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct AuthenticatedActor(pub Actor);

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct OptionalActor(pub Option<Actor>);

#[derive(Debug)]
pub enum AuthorizationError {
    Admin(AdminAuthError),
    Auth(AuthError),
    Forbidden(&'static str),
    Unauthorized(&'static str),
}

impl AuthorizationError {
    pub fn status_code(&self) -> StatusCode {
        match self {
            Self::Admin(AdminAuthError::Database(_))
            | Self::Auth(AuthError::Database(_))
            | Self::Admin(AdminAuthError::Random(_)) => StatusCode::INTERNAL_SERVER_ERROR,
            Self::Forbidden(_) => StatusCode::FORBIDDEN,
            Self::Unauthorized(_) | Self::Auth(_) => StatusCode::UNAUTHORIZED,
        }
    }

    pub fn public_message(&self) -> &'static str {
        match self {
            Self::Admin(_) | Self::Auth(AuthError::Database(_)) => "Authorization failed",
            Self::Auth(_) => "Authentication required",
            Self::Unauthorized(message) | Self::Forbidden(message) => message,
        }
    }
}

impl fmt::Display for AuthorizationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Admin(error) => write!(formatter, "admin authorization failed: {error}"),
            Self::Auth(error) => write!(formatter, "session authorization failed: {error}"),
            Self::Forbidden(message) | Self::Unauthorized(message) => formatter.write_str(message),
        }
    }
}

impl Error for AuthorizationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Admin(error) => Some(error),
            Self::Auth(error) => Some(error),
            Self::Forbidden(_) | Self::Unauthorized(_) => None,
        }
    }
}

impl From<AdminAuthError> for AuthorizationError {
    fn from(error: AdminAuthError) -> Self {
        Self::Admin(error)
    }
}

impl From<AuthError> for AuthorizationError {
    fn from(error: AuthError) -> Self {
        Self::Auth(error)
    }
}

impl IntoResponse for AuthorizationError {
    fn into_response(self) -> Response {
        match &self {
            Self::Admin(_) | Self::Auth(AuthError::Database(_)) => {
                tracing::error!(error = ?self, message = %self, "authorization guard failed");
            }
            _ => {}
        }

        (self.status_code(), self.public_message()).into_response()
    }
}

impl Actor {
    pub fn new(user: User) -> Self {
        Self { user }
    }

    pub fn sub(&self) -> &str {
        &self.user.sub
    }

    pub fn is_admin(&self) -> bool {
        self.user.role == UserRole::Admin
    }
}

impl From<User> for Actor {
    fn from(user: User) -> Self {
        Self::new(user)
    }
}

impl From<MctaiAuthenticatedActor> for Actor {
    fn from(actor: MctaiAuthenticatedActor) -> Self {
        Self::new(actor.user)
    }
}

pub fn is_authenticated(actor: Option<&Actor>) -> bool {
    actor.is_some()
}

pub fn is_admin(actor: Option<&Actor>) -> bool {
    actor.is_some_and(Actor::is_admin)
}

pub fn can_access_admin(actor: Option<&Actor>) -> bool {
    is_admin(actor)
}

pub fn can_manage_subspaces(actor: Option<&Actor>) -> bool {
    is_admin(actor)
}

pub fn can_manage_tags(actor: Option<&Actor>) -> bool {
    is_admin(actor)
}

pub fn can_create_post(actor: Option<&Actor>) -> bool {
    is_authenticated(actor)
}

pub fn can_edit_owned_resource(actor: Option<&Actor>, owner_sub: &str) -> bool {
    actor.is_some_and(|actor| actor.is_admin() || actor.sub() == owner_sub)
}

pub fn can_edit_post(actor: Option<&Actor>, post_author_sub: &str) -> bool {
    can_edit_owned_resource(actor, post_author_sub)
}

pub fn require_authenticated(actor: Option<Actor>) -> Result<Actor, AuthorizationError> {
    actor.ok_or(AuthorizationError::Unauthorized("Authentication required"))
}

pub fn require_admin(actor: Option<Actor>) -> Result<Actor, AuthorizationError> {
    match actor {
        Some(actor) if actor.is_admin() => Ok(actor),
        Some(_) => Err(AuthorizationError::Forbidden("Admin access required")),
        None => Err(AuthorizationError::Unauthorized("Authentication required")),
    }
}

pub fn require_post_create(actor: Option<Actor>) -> Result<Actor, AuthorizationError> {
    require_authenticated(actor)
}

pub fn require_author_or_admin(
    actor: Option<Actor>,
    owner_sub: &str,
) -> Result<Actor, AuthorizationError> {
    match actor {
        Some(actor) if actor.is_admin() || actor.sub() == owner_sub => Ok(actor),
        Some(_) => Err(AuthorizationError::Forbidden(
            "Author or admin access required",
        )),
        None => Err(AuthorizationError::Unauthorized("Authentication required")),
    }
}

pub fn require_subspace_manager(actor: Option<Actor>) -> Result<Actor, AuthorizationError> {
    require_admin(actor)
}

pub fn require_tag_manager(actor: Option<Actor>) -> Result<Actor, AuthorizationError> {
    require_admin(actor)
}

pub async fn actor_from_cookie_header(
    state: &AppState,
    cookie_header: Option<&str>,
) -> Result<Option<Actor>, AuthorizationError> {
    if let Some(admin_session) = state
        .admin
        .authenticate_cookie_header(cookie_header)
        .await
        .map_err(AuthorizationError::from)?
    {
        return Ok(Some(Actor::from(admin_session.user)));
    }

    let actor = state
        .auth
        .authenticate_cookie_header(cookie_header)
        .await
        .map_err(AuthorizationError::from)?
        .map(Actor::from);

    Ok(actor)
}

impl FromRequestParts<AppState> for AuthenticatedActor {
    type Rejection = AuthorizationError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let cookie_header = parts
            .headers
            .get(header::COOKIE)
            .and_then(|value| value.to_str().ok());

        let actor = actor_from_cookie_header(state, cookie_header).await?;

        require_authenticated(actor).map(Self)
    }
}

impl FromRequestParts<AppState> for OptionalActor {
    type Rejection = AuthorizationError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let cookie_header = parts
            .headers
            .get(header::COOKIE)
            .and_then(|value| value.to_str().ok());

        actor_from_cookie_header(state, cookie_header)
            .await
            .map(Self)
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;

    use super::*;

    fn user(sub: &str, role: UserRole) -> User {
        let now = Utc::now();

        User {
            sub: sub.to_owned(),
            email: format!("{sub}@example.test"),
            email_verified: true,
            name: Some(sub.to_owned()),
            picture_url: None,
            role,
            created_at: now,
            updated_at: now,
            last_seen_at: now,
        }
    }

    fn actor(sub: &str, role: UserRole) -> Actor {
        Actor::from(user(sub, role))
    }

    #[test]
    fn detects_authenticated_actors_and_admins() {
        let regular_user = actor("user-1", UserRole::User);
        let admin = actor("admin-1", UserRole::Admin);

        assert!(!is_authenticated(None));
        assert!(is_authenticated(Some(&regular_user)));
        assert!(!is_admin(Some(&regular_user)));
        assert!(is_admin(Some(&admin)));
        assert!(!can_access_admin(Some(&regular_user)));
        assert!(can_access_admin(Some(&admin)));
        assert!(can_manage_subspaces(Some(&admin)));
        assert!(can_manage_tags(Some(&admin)));
        assert!(!can_manage_subspaces(Some(&regular_user)));
        assert!(!can_manage_tags(Some(&regular_user)));
    }

    #[test]
    fn permits_post_creation_for_authenticated_actors() {
        let regular_user = actor("user-1", UserRole::User);

        assert!(!can_create_post(None));
        assert!(can_create_post(Some(&regular_user)));
        assert!(require_post_create(Some(regular_user)).is_ok());
        assert!(matches!(
            require_post_create(None),
            Err(AuthorizationError::Unauthorized("Authentication required"))
        ));
    }

    #[test]
    fn allows_owners_and_admins_to_edit_owned_resources() {
        let owner = actor("owner-1", UserRole::User);
        let other_user = actor("other-1", UserRole::User);
        let admin = actor("admin-1", UserRole::Admin);

        assert!(!can_edit_owned_resource(None, "owner-1"));
        assert!(can_edit_owned_resource(Some(&owner), "owner-1"));
        assert!(!can_edit_owned_resource(Some(&other_user), "owner-1"));
        assert!(can_edit_owned_resource(Some(&admin), "owner-1"));
        assert!(can_edit_post(Some(&owner), "owner-1"));
        assert!(can_edit_post(Some(&admin), "owner-1"));
    }

    #[test]
    fn returns_status_coded_errors_for_missing_or_insufficient_access() {
        assert!(matches!(
            require_authenticated(None),
            Err(AuthorizationError::Unauthorized("Authentication required"))
        ));
        assert_eq!(
            require_authenticated(None).unwrap_err().status_code(),
            StatusCode::UNAUTHORIZED
        );

        let regular_user = actor("user-1", UserRole::User);
        assert_eq!(
            require_admin(Some(regular_user)).unwrap_err().status_code(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            require_admin(None).unwrap_err().status_code(),
            StatusCode::UNAUTHORIZED
        );

        let other_user = actor("other-1", UserRole::User);
        assert_eq!(
            require_author_or_admin(Some(other_user), "owner-1")
                .unwrap_err()
                .status_code(),
            StatusCode::FORBIDDEN
        );
    }
}
