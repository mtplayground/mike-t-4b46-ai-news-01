use std::{error::Error, fmt};

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{patch, post},
    Json, Router,
};
use getrandom::fill as fill_random;
use serde::{Deserialize, Serialize};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

use crate::{
    authorization::{require_tag_manager, Actor, OptionalActor},
    db::{Database, DbError},
    models::Tag,
    state::AppState,
};

const MAX_NAME_LENGTH: usize = 80;
const MAX_SLUG_LENGTH: usize = 80;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TagInput {
    name: Option<String>,
    slug: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TagResponse {
    ok: bool,
    tag: SerializedTag,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeleteTagResponse {
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
    id: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    slug: Option<&'static str>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SerializedTag {
    created_at: String,
    id: String,
    name: String,
    slug: String,
    updated_at: String,
}

#[derive(Debug)]
struct ValidatedTagInput {
    name: String,
    slug: String,
}

#[derive(Debug)]
enum TagError {
    Authorization(crate::authorization::AuthorizationError),
    Database(DbError),
    InvalidInput {
        error: &'static str,
        field_errors: FieldErrors,
    },
    NotFound,
    Random(getrandom::Error),
    SlugConflict,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/tags", post(create_tag))
        .route("/api/tags/{id}", patch(update_tag).delete(delete_tag))
}

async fn create_tag(
    State(state): State<AppState>,
    OptionalActor(actor): OptionalActor,
    Json(input): Json<TagInput>,
) -> Response {
    match create_tag_inner(state.database, actor, input).await {
        Ok(tag) => (
            StatusCode::CREATED,
            Json(TagResponse {
                ok: true,
                tag: SerializedTag::from(tag),
            }),
        )
            .into_response(),
        Err(error) => error.into_response(),
    }
}

async fn update_tag(
    State(state): State<AppState>,
    OptionalActor(actor): OptionalActor,
    Path(id): Path<String>,
    Json(input): Json<TagInput>,
) -> Response {
    match update_tag_inner(state.database, actor, id, input).await {
        Ok(tag) => Json(TagResponse {
            ok: true,
            tag: SerializedTag::from(tag),
        })
        .into_response(),
        Err(error) => error.into_response(),
    }
}

async fn delete_tag(
    State(state): State<AppState>,
    OptionalActor(actor): OptionalActor,
    Path(id): Path<String>,
) -> Response {
    match delete_tag_inner(state.database, actor, id).await {
        Ok(id) => Json(DeleteTagResponse { id, ok: true }).into_response(),
        Err(error) => error.into_response(),
    }
}

async fn create_tag_inner(
    database: Database,
    actor: Option<Actor>,
    input: TagInput,
) -> Result<Tag, TagError> {
    require_tag_manager(actor).map_err(TagError::Authorization)?;
    let input = validate_tag_input(input)?;
    let id = generate_tag_id()?;

    database
        .create_tag(&id, &input.name, &input.slug)
        .await
        .map_err(TagError::from)
}

async fn update_tag_inner(
    database: Database,
    actor: Option<Actor>,
    id: String,
    input: TagInput,
) -> Result<Tag, TagError> {
    require_tag_manager(actor).map_err(TagError::Authorization)?;
    let id = trimmed_string(Some(id));

    if id.is_empty() {
        return Err(TagError::InvalidInput {
            error: "Tag id is required.",
            field_errors: FieldErrors {
                id: Some("Tag id is required."),
                ..FieldErrors::default()
            },
        });
    }

    let input = validate_tag_input(input)?;

    database
        .update_tag(&id, &input.name, &input.slug)
        .await
        .map_err(TagError::from)?
        .ok_or(TagError::NotFound)
}

async fn delete_tag_inner(
    database: Database,
    actor: Option<Actor>,
    id: String,
) -> Result<String, TagError> {
    require_tag_manager(actor).map_err(TagError::Authorization)?;
    let id = trimmed_string(Some(id));

    if id.is_empty() {
        return Err(TagError::InvalidInput {
            error: "Tag id is required.",
            field_errors: FieldErrors {
                id: Some("Tag id is required."),
                ..FieldErrors::default()
            },
        });
    }

    if !database.delete_tag(&id).await.map_err(TagError::from)? {
        return Err(TagError::NotFound);
    }

    Ok(id)
}

fn validate_tag_input(input: TagInput) -> Result<ValidatedTagInput, TagError> {
    let name = trimmed_string(input.name);
    let raw_slug = trimmed_string(input.slug);
    let slug = if raw_slug.is_empty() {
        generate_slug(&name)
    } else {
        normalize_slug(&raw_slug)
    };
    let mut field_errors = FieldErrors::default();

    if name.is_empty() {
        field_errors.name = Some("Name is required.");
    } else if name.chars().count() > MAX_NAME_LENGTH {
        field_errors.name = Some("Name must be 80 characters or fewer.");
    }

    if !is_valid_slug(&slug) {
        field_errors.slug = Some("Slug must contain lowercase letters, numbers, and hyphens.");
    }

    if field_errors.has_errors() {
        return Err(TagError::InvalidInput {
            error: "Tag input is invalid.",
            field_errors,
        });
    }

    Ok(ValidatedTagInput { name, slug })
}

fn trimmed_string(value: Option<String>) -> String {
    value.unwrap_or_default().trim().to_owned()
}

fn generate_slug(value: &str) -> String {
    value
        .nfkd()
        .filter(|character| !is_combining_mark(*character))
        .flat_map(|character| character.to_lowercase())
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .take(MAX_SLUG_LENGTH)
        .collect::<String>()
        .trim_end_matches('-')
        .to_owned()
}

fn normalize_slug(value: &str) -> String {
    generate_slug(value)
}

fn is_valid_slug(value: &str) -> bool {
    if value.is_empty() || value.len() > MAX_SLUG_LENGTH {
        return false;
    }

    let mut previous_hyphen = false;
    for (index, character) in value.chars().enumerate() {
        let is_hyphen = character == '-';
        let is_valid_character = character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (is_hyphen && index > 0 && !previous_hyphen);

        if !is_valid_character {
            return false;
        }

        previous_hyphen = is_hyphen;
    }

    !previous_hyphen
}

fn generate_tag_id() -> Result<String, TagError> {
    let mut bytes = [0_u8; 16];
    fill_random(&mut bytes)?;
    Ok(format!("tag:{}", hex::encode(bytes)))
}

impl FieldErrors {
    fn has_errors(&self) -> bool {
        self.id.is_some() || self.name.is_some() || self.slug.is_some()
    }
}

impl From<Tag> for SerializedTag {
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

impl From<DbError> for TagError {
    fn from(error: DbError) -> Self {
        if error.is_unique_violation() {
            Self::SlugConflict
        } else {
            Self::Database(error)
        }
    }
}

impl From<getrandom::Error> for TagError {
    fn from(error: getrandom::Error) -> Self {
        Self::Random(error)
    }
}

impl fmt::Display for TagError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Authorization(error) => write!(formatter, "tag authorization failed: {error}"),
            Self::Database(error) => write!(formatter, "tag database error: {error}"),
            Self::InvalidInput { error, .. } => formatter.write_str(error),
            Self::NotFound => formatter.write_str("Tag was not found."),
            Self::Random(error) => write!(formatter, "tag id generation failed: {error}"),
            Self::SlugConflict => formatter.write_str("Slug is already in use."),
        }
    }
}

impl Error for TagError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Authorization(error) => Some(error),
            Self::Database(error) => Some(error),
            Self::Random(_) => None,
            Self::InvalidInput { .. } | Self::NotFound | Self::SlugConflict => None,
        }
    }
}

impl IntoResponse for TagError {
    fn into_response(self) -> Response {
        match self {
            Self::Authorization(error) => error.into_response(),
            Self::InvalidInput {
                error,
                field_errors,
            } => (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error,
                    field_errors: Some(field_errors),
                    ok: false,
                }),
            )
                .into_response(),
            Self::NotFound => (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Tag was not found.",
                    field_errors: Some(FieldErrors {
                        id: Some("Tag was not found."),
                        ..FieldErrors::default()
                    }),
                    ok: false,
                }),
            )
                .into_response(),
            Self::SlugConflict => (
                StatusCode::CONFLICT,
                Json(ErrorResponse {
                    error: "Slug is already in use.",
                    field_errors: Some(FieldErrors {
                        slug: Some("Slug is already in use."),
                        ..FieldErrors::default()
                    }),
                    ok: false,
                }),
            )
                .into_response(),
            error @ (Self::Database(_) | Self::Random(_)) => {
                tracing::error!(error = ?error, message = %error, "tag endpoint failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Tag mutation failed.",
                        field_errors: None,
                        ok: false,
                    }),
                )
                    .into_response()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_and_validates_slugs() {
        assert_eq!(
            generate_slug("  Café AI: Launch Notes!  "),
            "cafe-ai-launch-notes"
        );
        assert_eq!(
            normalize_slug("Research & Development"),
            "research-development"
        );
        assert_eq!(generate_slug(&format!("{}!!!", "a".repeat(90))).len(), 80);
        assert!(is_valid_slug("ai-news"));
        assert!(is_valid_slug("a1-b2"));
        assert!(!is_valid_slug("AI-News"));
        assert!(!is_valid_slug("-ai-news"));
        assert!(!is_valid_slug("ai--news"));
        assert!(!is_valid_slug(""));
        assert!(!is_valid_slug(&"a".repeat(81)));
    }

    #[test]
    fn validates_required_name_and_length_limit() {
        let error = validate_tag_input(TagInput {
            name: Some(" ".to_owned()),
            slug: None,
        })
        .unwrap_err();

        match error {
            TagError::InvalidInput { field_errors, .. } => {
                assert_eq!(field_errors.name, Some("Name is required."));
            }
            other => panic!("expected invalid input, got {other:?}"),
        }

        let error = validate_tag_input(TagInput {
            name: Some("x".repeat(MAX_NAME_LENGTH + 1)),
            slug: None,
        })
        .unwrap_err();

        match error {
            TagError::InvalidInput { field_errors, .. } => {
                assert_eq!(
                    field_errors.name,
                    Some("Name must be 80 characters or fewer.")
                );
            }
            other => panic!("expected invalid input, got {other:?}"),
        }
    }
}
