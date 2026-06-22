use std::{error::Error, fmt};

use chrono::{DateTime, Utc};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};

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

impl DbError {
    pub fn is_unique_violation(&self) -> bool {
        matches!(
            self,
            Self::Sqlx(sqlx::Error::Database(error)) if error.code().as_deref() == Some("23505")
        )
    }
}

#[derive(Clone)]
pub struct Database {
    pool: PgPool,
}

#[allow(dead_code)]
impl Database {
    pub fn connect(config: &ServerConfig) -> Result<Self, DbError> {
        let pool = PgPoolOptions::new()
            .max_connections(DEFAULT_MAX_CONNECTIONS)
            .connect_lazy(&config.database_url)?;

        Ok(Self { pool })
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub async fn ping(&self) -> Result<(), DbError> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    pub async fn ensure_admin_user(&self) -> Result<models::User, DbError> {
        let user = sqlx::query_as::<_, models::User>(
            r#"
            INSERT INTO users (sub, email, email_verified, name, role, last_seen_at, updated_at)
            VALUES ('admin:password', 'admin@admin.local', true, 'Admin', 'admin'::user_role, NOW(), NOW())
            ON CONFLICT (sub) DO UPDATE SET
                email_verified = true,
                last_seen_at = NOW(),
                name = 'Admin',
                role = 'admin'::user_role,
                updated_at = NOW()
            RETURNING sub, email, email_verified, name, picture_url, role,
                      created_at, updated_at, last_seen_at
            "#,
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(user)
    }

    pub async fn delete_expired_admin_sessions(&self) -> Result<(), DbError> {
        sqlx::query(
            r#"
            DELETE FROM sessions
            WHERE user_sub = 'admin:password' AND expires <= NOW()
            "#,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn create_admin_session(
        &self,
        session_token_hash: &str,
        user_sub: &str,
        expires: DateTime<Utc>,
    ) -> Result<models::Session, DbError> {
        let id = format!("admin-session:{}", session_token_hash);
        let session = sqlx::query_as::<_, models::Session>(
            r#"
            INSERT INTO sessions (id, session_token, user_sub, expires, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            RETURNING id, session_token, user_sub, expires, created_at, updated_at
            "#,
        )
        .bind(id)
        .bind(session_token_hash)
        .bind(user_sub)
        .bind(expires)
        .fetch_one(&self.pool)
        .await?;

        Ok(session)
    }

    pub async fn admin_session_by_hash(
        &self,
        session_token_hash: &str,
    ) -> Result<Option<(models::Session, models::User)>, DbError> {
        let row = sqlx::query(
            r#"
            SELECT
                s.id AS session_id,
                s.session_token,
                s.user_sub,
                s.expires,
                s.created_at AS session_created_at,
                s.updated_at AS session_updated_at,
                u.sub,
                u.email,
                u.email_verified,
                u.name,
                u.picture_url,
                u.role,
                u.created_at AS user_created_at,
                u.updated_at AS user_updated_at,
                u.last_seen_at
            FROM sessions s
            INNER JOIN users u ON u.sub = s.user_sub
            WHERE s.session_token = $1
            "#,
        )
        .bind(session_token_hash)
        .fetch_optional(&self.pool)
        .await?;

        let Some(row) = row else {
            return Ok(None);
        };

        let session = models::Session {
            id: row.try_get("session_id")?,
            session_token: row.try_get("session_token")?,
            user_sub: row.try_get("user_sub")?,
            expires: row.try_get("expires")?,
            created_at: row.try_get("session_created_at")?,
            updated_at: row.try_get("session_updated_at")?,
        };
        let user = models::User {
            sub: row.try_get("sub")?,
            email: row.try_get("email")?,
            email_verified: row.try_get("email_verified")?,
            name: row.try_get("name")?,
            picture_url: row.try_get("picture_url")?,
            role: row.try_get("role")?,
            created_at: row.try_get("user_created_at")?,
            updated_at: row.try_get("user_updated_at")?,
            last_seen_at: row.try_get("last_seen_at")?,
        };

        Ok(Some((session, user)))
    }

    pub async fn delete_admin_session_by_hash(
        &self,
        session_token_hash: &str,
    ) -> Result<(), DbError> {
        sqlx::query(
            r#"
            DELETE FROM sessions
            WHERE session_token = $1 AND user_sub = 'admin:password'
            "#,
        )
        .bind(session_token_hash)
        .execute(&self.pool)
        .await?;

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

    pub async fn sync_user_from_claims(
        &self,
        claims: &crate::auth::MctaiSessionClaims,
    ) -> Result<models::User, DbError> {
        let user = sqlx::query_as::<_, models::User>(
            r#"
            INSERT INTO users (sub, email, email_verified, name, picture_url, last_seen_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            ON CONFLICT (sub) DO UPDATE SET
                email = EXCLUDED.email,
                email_verified = EXCLUDED.email_verified,
                name = EXCLUDED.name,
                picture_url = EXCLUDED.picture_url,
                last_seen_at = NOW(),
                updated_at = NOW()
            RETURNING sub, email, email_verified, name, picture_url, role,
                      created_at, updated_at, last_seen_at
            "#,
        )
        .bind(&claims.sub)
        .bind(&claims.email)
        .bind(claims.email_verified)
        .bind(&claims.name)
        .bind(&claims.picture)
        .fetch_one(&self.pool)
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

    pub async fn create_subspace(
        &self,
        id: &str,
        name: &str,
        slug: &str,
        description: &str,
    ) -> Result<models::Subspace, DbError> {
        let subspace = sqlx::query_as::<_, models::Subspace>(
            r#"
            INSERT INTO subspaces (id, name, slug, description, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            RETURNING id, name, slug, description, created_at, updated_at
            "#,
        )
        .bind(id)
        .bind(name)
        .bind(slug)
        .bind(description)
        .fetch_one(&self.pool)
        .await?;

        Ok(subspace)
    }

    pub async fn update_subspace(
        &self,
        id: &str,
        name: &str,
        slug: &str,
        description: &str,
    ) -> Result<Option<models::Subspace>, DbError> {
        let subspace = sqlx::query_as::<_, models::Subspace>(
            r#"
            UPDATE subspaces
            SET name = $2,
                slug = $3,
                description = $4,
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, name, slug, description, created_at, updated_at
            "#,
        )
        .bind(id)
        .bind(name)
        .bind(slug)
        .bind(description)
        .fetch_optional(&self.pool)
        .await?;

        Ok(subspace)
    }

    pub async fn delete_subspace(&self, id: &str) -> Result<bool, DbError> {
        let result = sqlx::query(
            r#"
            DELETE FROM subspaces
            WHERE id = $1
            "#,
        )
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
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

    pub async fn create_tag(
        &self,
        id: &str,
        name: &str,
        slug: &str,
    ) -> Result<models::Tag, DbError> {
        let tag = sqlx::query_as::<_, models::Tag>(
            r#"
            INSERT INTO tags (id, name, slug, created_at, updated_at)
            VALUES ($1, $2, $3, NOW(), NOW())
            RETURNING id, name, slug, created_at, updated_at
            "#,
        )
        .bind(id)
        .bind(name)
        .bind(slug)
        .fetch_one(&self.pool)
        .await?;

        Ok(tag)
    }

    pub async fn update_tag(
        &self,
        id: &str,
        name: &str,
        slug: &str,
    ) -> Result<Option<models::Tag>, DbError> {
        let tag = sqlx::query_as::<_, models::Tag>(
            r#"
            UPDATE tags
            SET name = $2,
                slug = $3,
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, name, slug, created_at, updated_at
            "#,
        )
        .bind(id)
        .bind(name)
        .bind(slug)
        .fetch_optional(&self.pool)
        .await?;

        Ok(tag)
    }

    pub async fn delete_tag(&self, id: &str) -> Result<bool, DbError> {
        let result = sqlx::query(
            r#"
            DELETE FROM tags
            WHERE id = $1
            "#,
        )
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
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
