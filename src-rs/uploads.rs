use std::{error::Error, fmt};

use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Multipart, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use chrono::{Datelike, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::{
    authorization::{require_post_create, Actor, OptionalActor},
    state::AppState,
    storage::{StorageError, StoredObject},
};

const MAX_UPLOAD_BYTES: usize = 100 * 1024 * 1024;
const MULTIPART_BODY_LIMIT_BYTES: usize = MAX_UPLOAD_BYTES + 1024 * 1024;

#[derive(Debug)]
struct UploadFile {
    body: Bytes,
    content_type: String,
    filename: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UploadResponse {
    content_type: String,
    object_key: String,
    relative_key: String,
    size: usize,
    uploaded_by: String,
    url: String,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: &'static str,
}

#[derive(Debug)]
enum UploadError {
    Authorization(crate::authorization::AuthorizationError),
    EmptyFile,
    FileTooLarge,
    MissingFile,
    Multipart(String),
    Storage(StorageError),
    UnsupportedMediaType,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/uploads", post(upload))
        .route("/api/files", post(files_compat))
        .layer(DefaultBodyLimit::max(MULTIPART_BODY_LIMIT_BYTES))
}

async fn upload(
    State(state): State<AppState>,
    OptionalActor(actor): OptionalActor,
    multipart: Multipart,
) -> Response {
    match upload_inner(state, actor, multipart).await {
        Ok(response) => (StatusCode::CREATED, Json(response)).into_response(),
        Err(error) => error.into_response(),
    }
}

async fn files_compat() -> Response {
    (
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "Use /api/uploads",
        }),
    )
        .into_response()
}

async fn upload_inner(
    state: AppState,
    actor: Option<Actor>,
    mut multipart: Multipart,
) -> Result<UploadResponse, UploadError> {
    let actor = require_post_create(actor).map_err(UploadError::Authorization)?;
    let file = read_upload_file(&mut multipart).await?;

    if !is_supported_media_type(&file.content_type) {
        return Err(UploadError::UnsupportedMediaType);
    }

    if file.body.is_empty() {
        return Err(UploadError::EmptyFile);
    }

    if file.body.len() > MAX_UPLOAD_BYTES {
        return Err(UploadError::FileTooLarge);
    }

    let relative_key = build_relative_key(&file.filename);
    let stored_object = state
        .storage
        .put_object(
            relative_key,
            file.body.to_vec(),
            file.content_type.to_owned(),
        )
        .await?;
    let url = state
        .storage
        .signed_get_url(&stored_object.relative_key)
        .await?;

    Ok(upload_response(stored_object, actor.sub().to_owned(), url))
}

async fn read_upload_file(multipart: &mut Multipart) -> Result<UploadFile, UploadError> {
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|error| UploadError::Multipart(error.to_string()))?
    {
        if field.name() != Some("file") {
            continue;
        }

        let filename = field.file_name().unwrap_or("upload").to_owned();
        let content_type = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_owned();
        let body = field
            .bytes()
            .await
            .map_err(|error| UploadError::Multipart(error.to_string()))?;

        return Ok(UploadFile {
            body,
            content_type,
            filename,
        });
    }

    Err(UploadError::MissingFile)
}

fn upload_response(
    stored_object: StoredObject,
    uploaded_by: String,
    url: String,
) -> UploadResponse {
    UploadResponse {
        content_type: stored_object.content_type,
        object_key: stored_object.object_key,
        relative_key: stored_object.relative_key,
        size: stored_object.content_length,
        uploaded_by,
        url,
    }
}

fn is_supported_media_type(content_type: &str) -> bool {
    content_type.starts_with("image/") || content_type.starts_with("video/")
}

fn safe_filename(filename: &str) -> String {
    let normalized = filename
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_owned();

    if normalized.is_empty() {
        "upload".to_owned()
    } else {
        normalized
    }
}

fn build_relative_key(filename: &str) -> String {
    let now = Utc::now();

    format!(
        "uploads/{}/{:02}/{}-{}",
        now.year(),
        now.month(),
        Uuid::new_v4(),
        safe_filename(filename)
    )
}

impl From<StorageError> for UploadError {
    fn from(error: StorageError) -> Self {
        Self::Storage(error)
    }
}

impl fmt::Display for UploadError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Authorization(error) => write!(formatter, "upload authorization failed: {error}"),
            Self::EmptyFile => formatter.write_str("Uploaded file is empty"),
            Self::FileTooLarge => formatter.write_str("Uploaded file is larger than 100 MB"),
            Self::MissingFile => formatter.write_str("Upload field \"file\" is required"),
            Self::Multipart(error) => write!(formatter, "multipart upload parse failed: {error}"),
            Self::Storage(error) => write!(formatter, "object storage upload failed: {error}"),
            Self::UnsupportedMediaType => {
                formatter.write_str("Only image and video uploads are supported")
            }
        }
    }
}

impl Error for UploadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Authorization(error) => Some(error),
            Self::Storage(error) => Some(error),
            Self::EmptyFile
            | Self::FileTooLarge
            | Self::MissingFile
            | Self::Multipart(_)
            | Self::UnsupportedMediaType => None,
        }
    }
}

impl IntoResponse for UploadError {
    fn into_response(self) -> Response {
        match self {
            Self::Authorization(error) => error.into_response(),
            Self::MissingFile => {
                error_response(StatusCode::BAD_REQUEST, "Upload field \"file\" is required")
            }
            Self::EmptyFile => error_response(StatusCode::BAD_REQUEST, "Uploaded file is empty"),
            Self::FileTooLarge => error_response(
                StatusCode::PAYLOAD_TOO_LARGE,
                "Uploaded file is larger than 100 MB",
            ),
            Self::UnsupportedMediaType => error_response(
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                "Only image and video uploads are supported",
            ),
            error @ (Self::Multipart(_) | Self::Storage(_)) => {
                tracing::error!(error = ?error, message = %error, "upload endpoint failed");
                error_response(StatusCode::INTERNAL_SERVER_ERROR, "Upload failed")
            }
        }
    }
}

fn error_response(status: StatusCode, error: &'static str) -> Response {
    (status, Json(ErrorResponse { error })).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_upload_filenames() {
        assert_eq!(safe_filename(" My Cat!.PNG "), "my-cat-.png");
        assert_eq!(safe_filename("###"), "upload");
    }

    #[test]
    fn restricts_media_types_to_images_and_videos() {
        assert!(is_supported_media_type("image/png"));
        assert!(is_supported_media_type("video/mp4"));
        assert!(!is_supported_media_type("application/pdf"));
    }
}
