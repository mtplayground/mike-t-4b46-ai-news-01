use std::{collections::HashSet, error::Error, fmt};

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{patch, post},
    Json, Router,
};
use getrandom::fill as fill_random;
use serde::{Deserialize, Serialize};

use crate::{
    authorization::{require_author_or_admin, require_post_create, Actor, OptionalActor},
    db::{Database, DbError},
    models::{PostWithRelations, Tag},
    state::AppState,
};

const MAX_BODY_MARKDOWN_LENGTH: usize = 100_000;
const MAX_TAGS_PER_POST: usize = 24;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PostInput {
    body_markdown: Option<String>,
    subspace_id: Option<String>,
    tag_ids: Option<TagIdsInput>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum TagIdsInput {
    Many(Vec<String>),
    One(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PostResponse {
    ok: bool,
    post: SerializedPost,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeletePostResponse {
    id: String,
    ok: bool,
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
    id: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    subspace_id: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tag_ids: Option<&'static str>,
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
struct ValidatedPostInput {
    body_markdown: String,
    subspace_id: String,
    tag_ids: Vec<String>,
}

#[derive(Debug)]
enum PostError {
    Authorization(crate::authorization::AuthorizationError),
    Database(DbError),
    InvalidInput {
        error: &'static str,
        field_errors: FieldErrors,
    },
    InvalidReference {
        field_errors: FieldErrors,
    },
    NotFound,
    Random(getrandom::Error),
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/posts", post(create_post))
        .route("/api/posts/{id}", patch(update_post).delete(delete_post))
}

async fn create_post(
    State(state): State<AppState>,
    OptionalActor(actor): OptionalActor,
    Json(input): Json<PostInput>,
) -> Response {
    match create_post_inner(state.database, actor, input).await {
        Ok(post) => (
            StatusCode::CREATED,
            Json(PostResponse {
                ok: true,
                post: SerializedPost::from(post),
            }),
        )
            .into_response(),
        Err(error) => error.into_response(),
    }
}

async fn update_post(
    State(state): State<AppState>,
    OptionalActor(actor): OptionalActor,
    Path(id): Path<String>,
    Json(input): Json<PostInput>,
) -> Response {
    match update_post_inner(state.database, actor, id, input).await {
        Ok(post) => Json(PostResponse {
            ok: true,
            post: SerializedPost::from(post),
        })
        .into_response(),
        Err(error) => error.into_response(),
    }
}

async fn delete_post(
    State(state): State<AppState>,
    OptionalActor(actor): OptionalActor,
    Path(id): Path<String>,
) -> Response {
    match delete_post_inner(state.database, actor, id).await {
        Ok(id) => Json(DeletePostResponse { id, ok: true }).into_response(),
        Err(error) => error.into_response(),
    }
}

async fn create_post_inner(
    database: Database,
    actor: Option<Actor>,
    input: PostInput,
) -> Result<PostWithRelations, PostError> {
    let actor = require_post_create(actor).map_err(PostError::Authorization)?;
    let input = validate_post_input(input)?;
    validate_references(&database, &input).await?;
    let id = generate_post_id()?;

    database
        .create_post_with_tags(
            &id,
            actor.sub(),
            &input.body_markdown,
            &input.subspace_id,
            &input.tag_ids,
        )
        .await
        .map_err(PostError::from)
}

async fn update_post_inner(
    database: Database,
    actor: Option<Actor>,
    id: String,
    input: PostInput,
) -> Result<PostWithRelations, PostError> {
    let actor = require_post_create(actor).map_err(PostError::Authorization)?;
    let id = trimmed_string(Some(id));

    if id.is_empty() {
        return Err(PostError::InvalidInput {
            error: "Post id is required.",
            field_errors: FieldErrors {
                id: Some("Post id is required."),
                ..FieldErrors::default()
            },
        });
    }

    let Some(author_sub) = database.post_author_sub(&id).await? else {
        return Err(PostError::NotFound);
    };

    require_author_or_admin(Some(actor), &author_sub).map_err(PostError::Authorization)?;
    let input = validate_post_input(input)?;
    validate_references(&database, &input).await?;

    database
        .update_post_with_tags(
            &id,
            &input.body_markdown,
            &input.subspace_id,
            &input.tag_ids,
        )
        .await
        .map_err(PostError::from)?
        .ok_or(PostError::NotFound)
}

async fn delete_post_inner(
    database: Database,
    actor: Option<Actor>,
    id: String,
) -> Result<String, PostError> {
    let actor = require_post_create(actor).map_err(PostError::Authorization)?;
    let id = trimmed_string(Some(id));

    if id.is_empty() {
        return Err(PostError::InvalidInput {
            error: "Post id is required.",
            field_errors: FieldErrors {
                id: Some("Post id is required."),
                ..FieldErrors::default()
            },
        });
    }

    let Some(author_sub) = database.post_author_sub(&id).await? else {
        return Err(PostError::NotFound);
    };

    require_author_or_admin(Some(actor), &author_sub).map_err(PostError::Authorization)?;

    if !database.delete_post(&id).await? {
        return Err(PostError::NotFound);
    }

    Ok(id)
}

async fn validate_references(
    database: &Database,
    input: &ValidatedPostInput,
) -> Result<(), PostError> {
    let mut field_errors = FieldErrors::default();

    if database.subspace_by_id(&input.subspace_id).await?.is_none() {
        field_errors.subspace_id = Some("Subspace was not found.");
    }

    for tag_id in &input.tag_ids {
        if database.tag_by_id(tag_id).await?.is_none() {
            field_errors.tag_ids = Some("One or more selected tags were not found.");
            break;
        }
    }

    if field_errors.has_errors() {
        return Err(PostError::InvalidReference { field_errors });
    }

    Ok(())
}

fn validate_post_input(input: PostInput) -> Result<ValidatedPostInput, PostError> {
    let body_markdown = trimmed_string(input.body_markdown);
    let subspace_id = trimmed_string(input.subspace_id);
    let tag_ids = normalize_tag_ids(input.tag_ids);
    let mut field_errors = FieldErrors::default();

    if body_markdown.is_empty() {
        field_errors.body_markdown = Some("Post body is required.");
    } else if body_markdown.chars().count() > MAX_BODY_MARKDOWN_LENGTH {
        field_errors.body_markdown = Some("Post body must be 100000 characters or fewer.");
    }

    if subspace_id.is_empty() {
        field_errors.subspace_id = Some("Subspace is required.");
    }

    if tag_ids.len() > MAX_TAGS_PER_POST {
        field_errors.tag_ids = Some("Posts can have at most 24 tags.");
    }

    if field_errors.has_errors() {
        return Err(PostError::InvalidInput {
            error: "Post input is invalid.",
            field_errors,
        });
    }

    Ok(ValidatedPostInput {
        body_markdown,
        subspace_id,
        tag_ids,
    })
}

fn normalize_tag_ids(input: Option<TagIdsInput>) -> Vec<String> {
    let Some(input) = input else {
        return Vec::new();
    };
    let raw_values = match input {
        TagIdsInput::Many(values) => values,
        TagIdsInput::One(value) => vec![value],
    };
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for value in raw_values {
        for tag_id in value
            .split(',')
            .map(str::trim)
            .filter(|tag_id| !tag_id.is_empty())
        {
            if seen.insert(tag_id.to_owned()) {
                normalized.push(tag_id.to_owned());
            }
        }
    }

    normalized
}

fn trimmed_string(value: Option<String>) -> String {
    value.unwrap_or_default().trim().to_owned()
}

fn generate_post_id() -> Result<String, PostError> {
    let mut bytes = [0_u8; 16];
    fill_random(&mut bytes)?;
    Ok(format!("post:{}", hex::encode(bytes)))
}

impl FieldErrors {
    fn has_errors(&self) -> bool {
        self.body_markdown.is_some()
            || self.id.is_some()
            || self.subspace_id.is_some()
            || self.tag_ids.is_some()
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

impl From<DbError> for PostError {
    fn from(error: DbError) -> Self {
        Self::Database(error)
    }
}

impl From<getrandom::Error> for PostError {
    fn from(error: getrandom::Error) -> Self {
        Self::Random(error)
    }
}

impl fmt::Display for PostError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Authorization(error) => write!(formatter, "post authorization failed: {error}"),
            Self::Database(error) => write!(formatter, "post database error: {error}"),
            Self::InvalidInput { error, .. } => formatter.write_str(error),
            Self::InvalidReference { .. } => formatter.write_str("Post input is invalid."),
            Self::NotFound => formatter.write_str("Post was not found."),
            Self::Random(error) => write!(formatter, "post id generation failed: {error}"),
        }
    }
}

impl Error for PostError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Authorization(error) => Some(error),
            Self::Database(error) => Some(error),
            Self::Random(_) => None,
            Self::InvalidInput { .. } | Self::InvalidReference { .. } | Self::NotFound => None,
        }
    }
}

impl IntoResponse for PostError {
    fn into_response(self) -> Response {
        match self {
            Self::Authorization(error) => error.into_response(),
            Self::InvalidInput {
                error,
                field_errors,
            } => post_error_response(StatusCode::BAD_REQUEST, error, Some(field_errors)),
            Self::InvalidReference { field_errors } => post_error_response(
                StatusCode::BAD_REQUEST,
                "Post input is invalid.",
                Some(field_errors),
            ),
            Self::NotFound => post_error_response(
                StatusCode::NOT_FOUND,
                "Post was not found.",
                Some(FieldErrors {
                    id: Some("Post was not found."),
                    ..FieldErrors::default()
                }),
            ),
            error @ Self::Database(_) if matches!(&error, Self::Database(db_error) if db_error.is_foreign_key_violation()) => {
                post_error_response(
                    StatusCode::BAD_REQUEST,
                    "Post references an invalid subspace, author, or tag.",
                    None,
                )
            }
            error @ (Self::Database(_) | Self::Random(_)) => {
                tracing::error!(error = ?error, message = %error, "post endpoint failed");
                post_error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Post mutation failed.",
                    None,
                )
            }
        }
    }
}

fn post_error_response(
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_body_subspace_and_tag_count() {
        let error = validate_post_input(PostInput {
            body_markdown: Some(" ".to_owned()),
            subspace_id: Some(" ".to_owned()),
            tag_ids: Some(TagIdsInput::Many(Vec::new())),
        })
        .unwrap_err();

        match error {
            PostError::InvalidInput { field_errors, .. } => {
                assert_eq!(field_errors.body_markdown, Some("Post body is required."));
                assert_eq!(field_errors.subspace_id, Some("Subspace is required."));
            }
            other => panic!("expected invalid input, got {other:?}"),
        }

        let many_tags = (0..=MAX_TAGS_PER_POST)
            .map(|index| format!("tag-{index}"))
            .collect();
        let error = validate_post_input(PostInput {
            body_markdown: Some("hello".to_owned()),
            subspace_id: Some("subspace-1".to_owned()),
            tag_ids: Some(TagIdsInput::Many(many_tags)),
        })
        .unwrap_err();

        match error {
            PostError::InvalidInput { field_errors, .. } => {
                assert_eq!(
                    field_errors.tag_ids,
                    Some("Posts can have at most 24 tags.")
                );
            }
            other => panic!("expected invalid input, got {other:?}"),
        }
    }

    #[test]
    fn normalizes_and_deduplicates_tag_ids() {
        assert_eq!(
            normalize_tag_ids(Some(TagIdsInput::Many(vec![
                " tag-1,tag-2 ".to_owned(),
                "tag-1".to_owned(),
                " ".to_owned(),
            ]))),
            vec!["tag-1".to_owned(), "tag-2".to_owned()]
        );
    }
}
