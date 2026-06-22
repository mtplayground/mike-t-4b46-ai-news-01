use std::{error::Error, fmt, time::Duration};

use sqlx::{postgres::PgPoolOptions, PgPool};

use crate::{config::ServerConfig, models};

const DEFAULT_MAX_CONNECTIONS: u32 = 5;

#[derive(Debug)]
pub enum DbError {
    Sqlx(sqlx::Error),
}

impl fmt::Display for DbError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sqlx(error) => write!(formatter, "database error: {error}"),
        }
    }
}

impl Error for DbError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Sqlx(error) => Some(error),
        }
    }
}

impl From<sqlx::Error> for DbError {
    fn from(error: sqlx::Error) -> Self {
        Self::Sqlx(error)
    }
}

#[derive(Clone)]
pub struct Database {
    pool: PgPool,
}

#[allow(dead_code)]
impl Database {
    pub async fn connect(config: &ServerConfig) -> Result<Self, DbError> {
        let pool = PgPoolOptions::new()
            .max_connections(DEFAULT_MAX_CONNECTIONS)
            .acquire_timeout(Duration::from_secs(10))
            .connect(&config.database_url)
            .await?;

        Ok(Self { pool })
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub async fn ping(&self) -> Result<(), DbError> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    pub async fn user_by_sub(&self, sub: &str) -> Result<Option<models::User>, DbError> {
        let user = sqlx::query_as::<_, models::User>(
            r#"
            SELECT sub, email, email_verified, name, picture_url, role,
                   created_at, updated_at, last_seen_at
            FROM users
            WHERE sub = $1
            "#,
        )
        .bind(sub)
        .fetch_optional(&self.pool)
        .await?;

        Ok(user)
    }

    pub async fn session_by_token(
        &self,
        session_token: &str,
    ) -> Result<Option<models::Session>, DbError> {
        let session = sqlx::query_as::<_, models::Session>(
            r#"
            SELECT id, session_token, user_sub, expires, created_at, updated_at
            FROM sessions
            WHERE session_token = $1
            "#,
        )
        .bind(session_token)
        .fetch_optional(&self.pool)
        .await?;

        Ok(session)
    }

    pub async fn account_by_provider(
        &self,
        provider: &str,
        provider_account_id: &str,
    ) -> Result<Option<models::Account>, DbError> {
        let account = sqlx::query_as::<_, models::Account>(
            r#"
            SELECT id, user_sub, type, provider, provider_account_id,
                   refresh_token, access_token, expires_at, token_type,
                   scope, id_token, session_state, created_at, updated_at
            FROM accounts
            WHERE provider = $1 AND provider_account_id = $2
            "#,
        )
        .bind(provider)
        .bind(provider_account_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(account)
    }

    pub async fn subspace_by_slug(&self, slug: &str) -> Result<Option<models::Subspace>, DbError> {
        let subspace = sqlx::query_as::<_, models::Subspace>(
            r#"
            SELECT id, name, slug, description, created_at, updated_at
            FROM subspaces
            WHERE slug = $1
            "#,
        )
        .bind(slug)
        .fetch_optional(&self.pool)
        .await?;

        Ok(subspace)
    }

    pub async fn post_by_id(&self, id: &str) -> Result<Option<models::Post>, DbError> {
        let post = sqlx::query_as::<_, models::Post>(
            r#"
            SELECT id, body_markdown, author_sub, subspace_id, created_at, updated_at
            FROM posts
            WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(post)
    }

    pub async fn tag_by_slug(&self, slug: &str) -> Result<Option<models::Tag>, DbError> {
        let tag = sqlx::query_as::<_, models::Tag>(
            r#"
            SELECT id, name, slug, created_at, updated_at
            FROM tags
            WHERE slug = $1
            "#,
        )
        .bind(slug)
        .fetch_optional(&self.pool)
        .await?;

        Ok(tag)
    }

    pub async fn post_tags(&self, post_id: &str) -> Result<Vec<models::PostTag>, DbError> {
        let post_tags = sqlx::query_as::<_, models::PostTag>(
            r#"
            SELECT post_id, tag_id, created_at
            FROM post_tags
            WHERE post_id = $1
            ORDER BY created_at ASC
            "#,
        )
        .bind(post_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(post_tags)
    }
}
