use std::{collections::HashSet, error::Error, fmt};

use axum::{
    extract::{rejection::JsonRejection, DefaultBodyLimit, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use getrandom::fill as fill_random;
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;

use crate::{
    db::{Database, DbError},
    models::{PostWithRelations, Tag},
    state::AppState,
};

const ADMIN_AUTHOR_SUB: &str = "admin:password";
const BOT_POST_BODY_LIMIT_BYTES: usize = 128 * 1024;
const MAX_BODY_MARKDOWN_LENGTH: usize = 100_000;
const MAX_TAGS_PER_POST: usize = 24;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BotPostInput {
    body_markdown: Option<String>,
    subspace_slug: Option<String>,
    tag_slugs: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BotPostResponse {
    ok: bool,
    post: SerializedPost,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorResponse {
    error: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    field_errors: Option<FieldErrors>,
    ok: bool,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct FieldErrors {
    #[serde(skip_serializing_if = "Option::is_none")]
    body_markdown: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    subspace_slug: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tag_slugs: Option<&'static str>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SerializedPost {
    author: SerializedAuthor,
    author_sub: String,
    body_markdown: String,
    created_at: String,
    id: String,
    subspace: SerializedPostSubspace,
    subspace_id: String,
    tags: Vec<SerializedPostTag>,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SerializedAuthor {
    email: String,
    name: Option<String>,
    picture_url: Option<String>,
    sub: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SerializedPostSubspace {
    id: String,
    name: String,
    slug: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SerializedPostTag {
    created_at: String,
    id: String,
    name: String,
    slug: String,
    updated_at: String,
}

#[derive(Debug)]
struct ValidatedBotPostInput {
    body_markdown: String,
    subspace_slug: String,
    tag_slugs: Vec<String>,
}

#[derive(Debug)]
enum BotPostError {
    Database(DbError),
    InvalidInput {
        error: &'static str,
        field_errors: FieldErrors,
    },
    InvalidJson,
    NotFound {
        error: &'static str,
        field_errors: FieldErrors,
    },
    PayloadTooLarge,
    Random(getrandom::Error),
    Unauthorized,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/bot/posts", post(create_bot_post))
        .layer(DefaultBodyLimit::max(BOT_POST_BODY_LIMIT_BYTES))
}

async fn create_bot_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<BotPostInput>, JsonRejection>,
) -> Response {
    match create_bot_post_inner(state, &headers, input).await {
        Ok(post) => (
            StatusCode::CREATED,
            Json(BotPostResponse {
                ok: true,
                post: SerializedPost::from(post),
            }),
        )
            .into_response(),
        Err(error) => error.into_response(),
    }
}

async fn create_bot_post_inner(
    state: AppState,
    headers: &HeaderMap,
    input: Result<Json<BotPostInput>, JsonRejection>,
) -> Result<PostWithRelations, BotPostError> {
    verify_bot_token(headers, &state.ai_news_bot_api_token)?;
    let input = input.map_err(BotPostError::from)?.0;
    let input = validate_bot_post_input(input)?;
    let subspace = state
        .database
        .subspace_by_slug(&input.subspace_slug)
        .await?
        .ok_or_else(|| BotPostError::NotFound {
            error: "Subspace was not found.",
            field_errors: FieldErrors {
                subspace_slug: Some("Subspace was not found."),
                ..FieldErrors::default()
            },
        })?;
    let tag_ids = resolve_tag_ids(&state.database, &input.tag_slugs).await?;
    let id = generate_post_id()?;

    state.database.ensure_admin_user().await?;
    state
        .database
        .create_post_with_tags(
            &id,
            ADMIN_AUTHOR_SUB,
            &input.body_markdown,
            &subspace.id,
            &tag_ids,
        )
        .await
        .map_err(BotPostError::from)
}

async fn resolve_tag_ids(database: &Database, tag_slugs: &[String]) -> Result<Vec<String>, BotPostError> {
    let mut tag_ids = Vec::with_capacity(tag_slugs.len());

    for tag_slug in tag_slugs {
        let tag = database
            .tag_by_slug(tag_slug)
            .await?
            .ok_or_else(|| BotPostError::NotFound {
                error: "One or more tag slugs were not found.",
                field_errors: FieldErrors {
                    tag_slugs: Some("One or more tag slugs were not found."),
                    ..FieldErrors::default()
                },
            })?;

        tag_ids.push(tag.id);
    }

    Ok(tag_ids)
}

fn verify_bot_token(headers: &HeaderMap, expected_token: &str) -> Result<(), BotPostError> {
    let Some(candidate) = bearer_token(headers) else {
        return Err(BotPostError::Unauthorized);
    };

    if candidate
        .as_bytes()
        .ct_eq(expected_token.as_bytes())
        .into()
    {
        Ok(())
    } else {
        Err(BotPostError::Unauthorized)
    }
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    value.strip_prefix("Bearer ").map(str::trim).filter(|token| !token.is_empty())
}

fn validate_bot_post_input(input: BotPostInput) -> Result<ValidatedBotPostInput, BotPostError> {
    let body_markdown = trimmed_string(input.body_markdown);
    let subspace_slug = trimmed_string(input.subspace_slug);
    let tag_slugs = normalize_tag_slugs(input.tag_slugs);
    let mut field_errors = FieldErrors::default();

    if body_markdown.is_empty() {
        field_errors.body_markdown = Some("Post body is required.");
    } else if body_markdown.chars().count() > MAX_BODY_MARKDOWN_LENGTH {
        field_errors.body_markdown = Some("Post body must be 100000 characters or fewer.");
    }

    if subspace_slug.is_empty() {
        field_errors.subspace_slug = Some("Subspace slug is required.");
    }

    if tag_slugs.len() > MAX_TAGS_PER_POST {
        field_errors.tag_slugs = Some("Posts can have at most 24 tags.");
    }

    if field_errors.has_errors() {
        return Err(BotPostError::InvalidInput {
            error: "Bot post input is invalid.",
            field_errors,
        });
    }

    Ok(ValidatedBotPostInput {
        body_markdown,
        subspace_slug,
        tag_slugs,
    })
}

fn normalize_tag_slugs(input: Option<Vec<String>>) -> Vec<String> {
    let Some(input) = input else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for value in input {
        let tag_slug = value.trim();

        if !tag_slug.is_empty() && seen.insert(tag_slug.to_owned()) {
            normalized.push(tag_slug.to_owned());
        }
    }

    normalized
}

fn trimmed_string(value: Option<String>) -> String {
    value.unwrap_or_default().trim().to_owned()
}

fn generate_post_id() -> Result<String, BotPostError> {
    let mut bytes = [0_u8; 16];
    fill_random(&mut bytes)?;
    Ok(format!("post:{}", hex::encode(bytes)))
}

impl FieldErrors {
    fn has_errors(&self) -> bool {
        self.body_markdown.is_some() || self.subspace_slug.is_some() || self.tag_slugs.is_some()
    }
}

impl From<PostWithRelations> for SerializedPost {
    fn from(post: PostWithRelations) -> Self {
        Self {
            author: SerializedAuthor {
                email: post.author.email,
                name: post.author.name,
                picture_url: post.author.picture_url,
                sub: post.author.sub,
            },
            author_sub: post.post.author_sub,
            body_markdown: post.post.body_markdown,
            created_at: post.post.created_at.to_rfc3339(),
            id: post.post.id,
            subspace: SerializedPostSubspace {
                id: post.subspace.id,
                name: post.subspace.name,
                slug: post.subspace.slug,
            },
            subspace_id: post.post.subspace_id,
            tags: post.tags.into_iter().map(SerializedPostTag::from).collect(),
            updated_at: post.post.updated_at.to_rfc3339(),
        }
    }
}

impl From<Tag> for SerializedPostTag {
    fn from(tag: Tag) -> Self {
        Self {
            created_at: tag.created_at.to_rfc3339(),
            id: tag.id,
            name: tag.name,
            slug: tag.slug,
            updated_at: tag.updated_at.to_rfc3339(),
        }
    }
}

impl From<DbError> for BotPostError {
    fn from(error: DbError) -> Self {
        Self::Database(error)
    }
}

impl From<getrandom::Error> for BotPostError {
    fn from(error: getrandom::Error) -> Self {
        Self::Random(error)
    }
}

impl From<JsonRejection> for BotPostError {
    fn from(error: JsonRejection) -> Self {
        if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
            Self::PayloadTooLarge
        } else {
            Self::InvalidJson
        }
    }
}

impl fmt::Display for BotPostError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Database(error) => write!(formatter, "bot post database error: {error}"),
            Self::InvalidInput { error, .. } => formatter.write_str(error),
            Self::InvalidJson => formatter.write_str("Bot post request body must be valid JSON."),
            Self::NotFound { error, .. } => formatter.write_str(error),
            Self::PayloadTooLarge => formatter.write_str("Bot post request body is too large."),
            Self::Random(error) => write!(formatter, "bot post id generation failed: {error}"),
            Self::Unauthorized => formatter.write_str("Bot post token is missing or invalid."),
        }
    }
}

impl Error for BotPostError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Database(error) => Some(error),
            Self::Random(_) => None,
            Self::InvalidInput { .. }
            | Self::InvalidJson
            | Self::NotFound { .. }
            | Self::PayloadTooLarge
            | Self::Unauthorized => None,
        }
    }
}

impl IntoResponse for BotPostError {
    fn into_response(self) -> Response {
        match self {
            Self::Unauthorized => bot_post_error_response(
                StatusCode::UNAUTHORIZED,
                "Missing or invalid bot token.",
                None,
            ),
            Self::InvalidJson => bot_post_error_response(
                StatusCode::BAD_REQUEST,
                "Request body must be valid JSON.",
                None,
            ),
            Self::InvalidInput {
                error,
                field_errors,
            } => bot_post_error_response(StatusCode::BAD_REQUEST, error, Some(field_errors)),
            Self::NotFound {
                error,
                field_errors,
            } => bot_post_error_response(StatusCode::NOT_FOUND, error, Some(field_errors)),
            Self::PayloadTooLarge => bot_post_error_response(
                StatusCode::PAYLOAD_TOO_LARGE,
                "Request body is too large.",
                None,
            ),
            error @ Self::Database(_) if matches!(&error, Self::Database(db_error) if db_error.is_foreign_key_violation()) => {
                bot_post_error_response(
                    StatusCode::BAD_REQUEST,
                    "Post references an invalid subspace, author, or tag.",
                    None,
                )
            }
            error @ (Self::Database(_) | Self::Random(_)) => {
                tracing::error!(error = ?error, message = %error, "bot post endpoint failed");
                bot_post_error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Bot post mutation failed.",
                    None,
                )
            }
        }
    }
}

fn bot_post_error_response(
    status: StatusCode,
    error: &'static str,
    field_errors: Option<FieldErrors>,
) -> Response {
    (
        status,
        Json(ErrorResponse {
            error,
            field_errors,
            ok: false,
        }),
    )
        .into_response()
}
