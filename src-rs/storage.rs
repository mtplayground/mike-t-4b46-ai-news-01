use std::{error::Error, fmt};

use chrono::Utc;
use hmac::{Hmac, Mac};
use reqwest::{
    header::{CONTENT_LENGTH, CONTENT_TYPE, HOST},
    Client, Url,
};
use sha2::{Digest, Sha256};

use crate::config::ObjectStorageConfig;

type HmacSha256 = Hmac<Sha256>;

const SIGNED_GET_EXPIRES_SECONDS: u64 = 60 * 60;
const SERVICE: &str = "s3";

#[derive(Clone)]
pub struct StorageService {
    access_key_id: String,
    bucket: String,
    endpoint: Url,
    force_path_style: bool,
    http_client: Client,
    prefix: String,
    region: String,
    secret_access_key: String,
}

#[derive(Debug)]
pub enum StorageError {
    InvalidConfig(&'static str),
    PutObject(String),
    Sign(String),
}

pub struct StoredObject {
    pub content_length: usize,
    pub content_type: String,
    pub object_key: String,
    pub relative_key: String,
}

struct ObjectUrlParts {
    canonical_uri: String,
    host: String,
    url: String,
}

impl StorageService {
    pub fn new(config: ObjectStorageConfig) -> Result<Self, StorageError> {
        if config.prefix.is_empty() {
            return Err(StorageError::InvalidConfig(
                "OBJECT_STORAGE_PREFIX env not set",
            ));
        }

        Ok(Self {
            access_key_id: config.access_key_id,
            bucket: config.bucket,
            endpoint: Url::parse(&config.endpoint)
                .map_err(|_| StorageError::InvalidConfig("OBJECT_STORAGE_ENDPOINT is invalid"))?,
            force_path_style: config.force_path_style,
            http_client: Client::new(),
            prefix: config.prefix,
            region: config.region,
            secret_access_key: config.secret_access_key,
        })
    }

    pub async fn put_object(
        &self,
        relative_key: String,
        body: Vec<u8>,
        content_type: String,
    ) -> Result<StoredObject, StorageError> {
        let object_key = self.object_key(&relative_key);
        let content_length = body.len();
        let content_length_header = content_length.to_string();
        let payload_hash = sha256_hex(&body);
        let now = Utc::now();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let date = now.format("%Y%m%d").to_string();
        let url_parts = self.object_url_parts(&object_key)?;
        let signed_headers = "content-length;content-type;host;x-amz-content-sha256;x-amz-date";
        let canonical_headers = format!(
            "content-length:{content_length_header}\ncontent-type:{content_type}\nhost:{}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n",
            url_parts.host
        );
        let canonical_request = format!(
            "PUT\n{}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}",
            url_parts.canonical_uri
        );
        let authorization =
            self.authorization_header(&date, &amz_date, &canonical_request, signed_headers)?;

        let response = self
            .http_client
            .put(&url_parts.url)
            .header(HOST, url_parts.host)
            .header(CONTENT_LENGTH, content_length_header)
            .header(CONTENT_TYPE, &content_type)
            .header("x-amz-content-sha256", payload_hash)
            .header("x-amz-date", amz_date)
            .header("authorization", authorization)
            .body(body)
            .send()
            .await
            .map_err(|error| StorageError::PutObject(error.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(StorageError::PutObject(format!(
                "S3 PUT failed with {status}: {body}"
            )));
        }

        Ok(StoredObject {
            content_length,
            content_type,
            object_key,
            relative_key,
        })
    }

    pub async fn signed_get_url(&self, relative_key: &str) -> Result<String, StorageError> {
        let object_key = self.object_key(relative_key);
        let now = Utc::now();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let date = now.format("%Y%m%d").to_string();
        let url_parts = self.object_url_parts(&object_key)?;
        let credential_scope = self.credential_scope(&date);
        let credential = format!("{}/{}", self.access_key_id, credential_scope);
        let mut query_pairs = vec![
            ("X-Amz-Algorithm".to_owned(), "AWS4-HMAC-SHA256".to_owned()),
            ("X-Amz-Credential".to_owned(), credential),
            ("X-Amz-Date".to_owned(), amz_date.clone()),
            (
                "X-Amz-Expires".to_owned(),
                SIGNED_GET_EXPIRES_SECONDS.to_string(),
            ),
            ("X-Amz-SignedHeaders".to_owned(), "host".to_owned()),
        ];
        query_pairs.sort_by(|left, right| left.0.cmp(&right.0));
        let canonical_query = canonical_query_string(&query_pairs);
        let canonical_headers = format!("host:{}\n", url_parts.host);
        let canonical_request = format!(
            "GET\n{}\n{canonical_query}\n{canonical_headers}\nhost\nUNSIGNED-PAYLOAD",
            url_parts.canonical_uri
        );
        let signature = self.signature(&date, &amz_date, &canonical_request)?;

        Ok(format!(
            "{}?{canonical_query}&X-Amz-Signature={signature}",
            url_parts.url
        ))
    }

    fn object_key(&self, relative_key: &str) -> String {
        format!("{}{}", self.prefix, relative_key)
    }

    fn object_url_parts(&self, object_key: &str) -> Result<ObjectUrlParts, StorageError> {
        let scheme = self.endpoint.scheme();
        let endpoint_host = self.endpoint.host_str().ok_or(StorageError::InvalidConfig(
            "OBJECT_STORAGE_ENDPOINT missing host",
        ))?;
        let endpoint_host = match self.endpoint.port() {
            Some(port) => format!("{endpoint_host}:{port}"),
            None => endpoint_host.to_owned(),
        };
        let base_path = self.endpoint.path().trim_end_matches('/');
        let encoded_bucket = uri_encode(&self.bucket, false);
        let encoded_key = uri_encode(object_key, true);

        let (host, canonical_uri) = if self.force_path_style {
            (
                endpoint_host,
                format!("{base_path}/{encoded_bucket}/{encoded_key}"),
            )
        } else {
            (
                format!("{}.{}", self.bucket, endpoint_host),
                format!("{base_path}/{encoded_key}"),
            )
        };
        let url = format!("{scheme}://{host}{canonical_uri}");

        Ok(ObjectUrlParts {
            canonical_uri,
            host,
            url,
        })
    }

    fn authorization_header(
        &self,
        date: &str,
        amz_date: &str,
        canonical_request: &str,
        signed_headers: &str,
    ) -> Result<String, StorageError> {
        let signature = self.signature(date, amz_date, canonical_request)?;
        let credential_scope = self.credential_scope(date);

        Ok(format!(
            "AWS4-HMAC-SHA256 Credential={}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}",
            self.access_key_id
        ))
    }

    fn signature(
        &self,
        date: &str,
        amz_date: &str,
        canonical_request: &str,
    ) -> Result<String, StorageError> {
        let credential_scope = self.credential_scope(date);
        let string_to_sign = format!(
            "AWS4-HMAC-SHA256\n{amz_date}\n{credential_scope}\n{}",
            sha256_hex(canonical_request.as_bytes())
        );
        let signing_key = self.signing_key(date)?;
        let signature = hmac_sha256(&signing_key, string_to_sign.as_bytes())?;

        Ok(hex::encode(signature))
    }

    fn credential_scope(&self, date: &str) -> String {
        format!("{date}/{}/{SERVICE}/aws4_request", self.region)
    }

    fn signing_key(&self, date: &str) -> Result<Vec<u8>, StorageError> {
        let date_key = hmac_sha256(
            format!("AWS4{}", self.secret_access_key).as_bytes(),
            date.as_bytes(),
        )?;
        let date_region_key = hmac_sha256(&date_key, self.region.as_bytes())?;
        let date_region_service_key = hmac_sha256(&date_region_key, SERVICE.as_bytes())?;

        hmac_sha256(&date_region_service_key, b"aws4_request")
    }
}

fn canonical_query_string(query_pairs: &[(String, String)]) -> String {
    query_pairs
        .iter()
        .map(|(key, value)| format!("{}={}", uri_encode(key, false), uri_encode(value, false)))
        .collect::<Vec<_>>()
        .join("&")
}

fn sha256_hex(value: &[u8]) -> String {
    hex::encode(Sha256::digest(value))
}

fn hmac_sha256(key: &[u8], value: &[u8]) -> Result<Vec<u8>, StorageError> {
    let mut mac =
        HmacSha256::new_from_slice(key).map_err(|error| StorageError::Sign(error.to_string()))?;
    mac.update(value);

    Ok(mac.finalize().into_bytes().to_vec())
}

fn uri_encode(value: &str, preserve_slash: bool) -> String {
    let mut encoded = String::new();

    for byte in value.bytes() {
        let allowed = byte.is_ascii_alphanumeric()
            || matches!(byte, b'-' | b'.' | b'_' | b'~')
            || (preserve_slash && byte == b'/');

        if allowed {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }

    encoded
}

impl fmt::Display for StorageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidConfig(message) => formatter.write_str(message),
            Self::PutObject(error) => write!(formatter, "failed to PUT S3 object: {error}"),
            Self::Sign(error) => write!(formatter, "failed to sign S3 request: {error}"),
        }
    }
}

impl Error for StorageError {}
