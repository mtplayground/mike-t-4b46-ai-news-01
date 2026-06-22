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
    authorization::{require_subspace_manager, Actor, OptionalActor},
    db::{Database, DbError},
    models::Subspace,
    state::AppState,
};

const MAX_DESCRIPTION_LENGTH: usize = 2_000;
const MAX_NAME_LENGTH: usize = 120;
const MAX_SLUG_LENGTH: usize = 80;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubspaceInput {
    description: Option<String>,
    name: Option<String>,
    slug: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SubspaceResponse {
    ok: bool,
    subspace: SerializedSubspace,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeleteSubspaceResponse {
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
    description: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    slug: Option<&'static str>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SerializedSubspace {
    created_at: String,
    description: String,
    id: String,
    name: String,
    slug: String,
    updated_at: String,
}

#[derive(Debug)]
struct ValidatedSubspaceInput {
    description: String,
    name: String,
    slug: String,
}

#[derive(Debug)]
enum SubspaceError {
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
        .route("/api/subspaces", post(create_subspace))
        .route(
            "/api/subspaces/{id}",
            patch(update_subspace).delete(delete_subspace),
        )
}

async fn create_subspace(
    State(state): State<AppState>,
    OptionalActor(actor): OptionalActor,
    Json(input): Json<SubspaceInput>,
) -> Response {
    match create_subspace_inner(state.database, actor, input).await {
        Ok(subspace) => (
            StatusCode::CREATED,
            Json(SubspaceResponse {
                ok: true,
                subspace: SerializedSubspace::from(subspace),
            }),
        )
            .into_response(),
        Err(error) => error.into_response(),
    }
}

async fn update_subspace(
    State(state): State<AppState>,
    OptionalActor(actor): OptionalActor,
    Path(id): Path<String>,
    Json(input): Json<SubspaceInput>,
) -> Response {
    match update_subspace_inner(state.database, actor, id, input).await {
        Ok(subspace) => Json(SubspaceResponse {
            ok: true,
            subspace: SerializedSubspace::from(subspace),
        })
        .into_response(),
        Err(error) => error.into_response(),
    }
}

async fn delete_subspace(
    State(state): State<AppState>,
    OptionalActor(actor): OptionalActor,
    Path(id): Path<String>,
) -> Response {
    match delete_subspace_inner(state.database, actor, id).await {
        Ok(id) => Json(DeleteSubspaceResponse { id, ok: true }).into_response(),
        Err(error) => error.into_response(),
    }
}

async fn create_subspace_inner(
    database: Database,
    actor: Option<Actor>,
    input: SubspaceInput,
) -> Result<Subspace, SubspaceError> {
    require_subspace_manager(actor).map_err(SubspaceError::Authorization)?;
    let input = validate_subspace_input(input)?;
    let id = generate_subspace_id()?;

    database
        .create_subspace(&id, &input.name, &input.slug, &input.description)
        .await
        .map_err(SubspaceError::from)
}

async fn update_subspace_inner(
    database: Database,
    actor: Option<Actor>,
    id: String,
    input: SubspaceInput,
) -> Result<Subspace, SubspaceError> {
    require_subspace_manager(actor).map_err(SubspaceError::Authorization)?;
    let id = trimmed_string(Some(id));

    if id.is_empty() {
        return Err(SubspaceError::InvalidInput {
            error: "Subspace id is required.",
            field_errors: FieldErrors {
                id: Some("Subspace id is required."),
                ..FieldErrors::default()
            },
        });
    }

    let input = validate_subspace_input(input)?;

    database
        .update_subspace(&id, &input.name, &input.slug, &input.description)
        .await
        .map_err(SubspaceError::from)?
        .ok_or(SubspaceError::NotFound)
}

async fn delete_subspace_inner(
    database: Database,
    actor: Option<Actor>,
    id: String,
) -> Result<String, SubspaceError> {
    require_subspace_manager(actor).map_err(SubspaceError::Authorization)?;
    let id = trimmed_string(Some(id));

    if id.is_empty() {
        return Err(SubspaceError::InvalidInput {
            error: "Subspace id is required.",
            field_errors: FieldErrors {
                id: Some("Subspace id is required."),
                ..FieldErrors::default()
            },
        });
    }

    if !database
        .delete_subspace(&id)
        .await
        .map_err(SubspaceError::from)?
    {
        return Err(SubspaceError::NotFound);
    }

    Ok(id)
}

fn validate_subspace_input(input: SubspaceInput) -> Result<ValidatedSubspaceInput, SubspaceError> {
    let name = trimmed_string(input.name);
    let description = trimmed_string(input.description);
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
        field_errors.name = Some("Name must be 120 characters or fewer.");
    }

    if !is_valid_slug(&slug) {
        field_errors.slug = Some("Slug must contain lowercase letters, numbers, and hyphens.");
    }

    if description.chars().count() > MAX_DESCRIPTION_LENGTH {
        field_errors.description = Some("Description must be 2000 characters or fewer.");
    }

    if field_errors.has_errors() {
        return Err(SubspaceError::InvalidInput {
            error: "Subspace input is invalid.",
            field_errors,
        });
    }

    Ok(ValidatedSubspaceInput {
        description,
        name,
        slug,
    })
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

fn generate_subspace_id() -> Result<String, SubspaceError> {
    let mut bytes = [0_u8; 16];
    fill_random(&mut bytes)?;
    Ok(format!("subspace:{}", hex::encode(bytes)))
}

impl FieldErrors {
    fn has_errors(&self) -> bool {
        self.description.is_some()
            || self.id.is_some()
            || self.name.is_some()
            || self.slug.is_some()
    }
}

impl From<Subspace> for SerializedSubspace {
    fn from(subspace: Subspace) -> Self {
        Self {
            created_at: subspace.created_at.to_rfc3339(),
            description: subspace.description,
            id: subspace.id,
            name: subspace.name,
            slug: subspace.slug,
            updated_at: subspace.updated_at.to_rfc3339(),
        }
    }
}

impl From<DbError> for SubspaceError {
    fn from(error: DbError) -> Self {
        if error.is_unique_violation() {
            Self::SlugConflict
        } else {
            Self::Database(error)
        }
    }
}

impl From<getrandom::Error> for SubspaceError {
    fn from(error: getrandom::Error) -> Self {
        Self::Random(error)
    }
}

impl fmt::Display for SubspaceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Authorization(error) => {
                write!(formatter, "subspace authorization failed: {error}")
            }
            Self::Database(error) => write!(formatter, "subspace database error: {error}"),
            Self::InvalidInput { error, .. } => formatter.write_str(error),
            Self::NotFound => formatter.write_str("Subspace was not found."),
            Self::Random(error) => write!(formatter, "subspace id generation failed: {error}"),
            Self::SlugConflict => formatter.write_str("Slug is already in use."),
        }
    }
}

impl Error for SubspaceError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Authorization(error) => Some(error),
            Self::Database(error) => Some(error),
            Self::Random(_) => None,
            Self::InvalidInput { .. } | Self::NotFound | Self::SlugConflict => None,
        }
    }
}

impl IntoResponse for SubspaceError {
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
                    error: "Subspace was not found.",
                    field_errors: Some(FieldErrors {
                        id: Some("Subspace was not found."),
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
                tracing::error!(error = ?error, message = %error, "subspace endpoint failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Subspace mutation failed.",
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
    fn validates_required_name_and_length_limits() {
        let error = validate_subspace_input(SubspaceInput {
            description: Some("x".repeat(MAX_DESCRIPTION_LENGTH + 1)),
            name: Some(" ".to_owned()),
            slug: Some("bad slug".to_owned()),
        })
        .unwrap_err();

        match error {
            SubspaceError::InvalidInput { field_errors, .. } => {
                assert_eq!(field_errors.name, Some("Name is required."));
                assert_eq!(
                    field_errors.description,
                    Some("Description must be 2000 characters or fewer.")
                );
            }
            other => panic!("expected invalid input, got {other:?}"),
        }
    }
}
