use std::{collections::HashMap, env, error::Error, fmt, fs, path::Path};

const DEFAULT_ENV_FILE: &str = ".env.production";
const REQUIRED_ENV: &[&str] = &[
    "ADMIN_PASSWORD",
    "DATABASE_URL",
    "MCTAI_AUTH_APP_TOKEN",
    "MCTAI_AUTH_JWKS_URL",
    "MCTAI_AUTH_URL",
    "OBJECT_STORAGE_ACCESS_KEY_ID",
    "OBJECT_STORAGE_BUCKET",
    "OBJECT_STORAGE_ENDPOINT",
    "OBJECT_STORAGE_FORCE_PATH_STYLE",
    "OBJECT_STORAGE_PREFIX",
    "OBJECT_STORAGE_REGION",
    "OBJECT_STORAGE_SECRET_ACCESS_KEY",
    "SELF_URL",
];
const URL_ENV: &[&str] = &[
    "MCTAI_AUTH_JWKS_URL",
    "MCTAI_AUTH_URL",
    "OBJECT_STORAGE_ENDPOINT",
    "SELF_URL",
];
const FORBIDDEN_GOOGLE_ENV: &[&str] = &[
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
];

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct AuthConfig {
    pub app_token: String,
    pub jwks_url: String,
    pub url: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct ObjectStorageConfig {
    pub access_key_id: String,
    pub bucket: String,
    pub endpoint: String,
    pub force_path_style: bool,
    pub prefix: String,
    pub region: String,
    pub secret_access_key: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub admin_password: String,
    pub auth: AuthConfig,
    pub database_url: String,
    pub object_storage: ObjectStorageConfig,
    pub self_url: String,
}

#[derive(Debug)]
pub enum ConfigError {
    InvalidBoolean { name: String },
    InvalidDatabaseUrl,
    InvalidObjectStorageEndpoint,
    InvalidObjectStoragePrefix(String),
    InvalidUrl { name: String },
    Io(std::io::Error),
    MissingEnv(String),
    PlaceholderEnv(String),
    ShortAdminPassword,
    ForbiddenGoogleOAuthEnv(Vec<String>),
}

impl fmt::Display for ConfigError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidBoolean { name } => {
                write!(
                    formatter,
                    "Environment variable {name} must be \"true\" or \"false\""
                )
            }
            Self::InvalidDatabaseUrl => write!(
                formatter,
                "DATABASE_URL must use the postgres:// or postgresql:// scheme"
            ),
            Self::InvalidObjectStorageEndpoint => write!(
                formatter,
                "OBJECT_STORAGE_ENDPOINT must not use a fabricated endpoint"
            ),
            Self::InvalidObjectStoragePrefix(message) => formatter.write_str(message),
            Self::InvalidUrl { name } => {
                write!(formatter, "Environment variable {name} must be a valid URL")
            }
            Self::Io(error) => write!(formatter, "Unable to read environment file: {error}"),
            Self::MissingEnv(name) => {
                write!(formatter, "Missing required environment variable: {name}")
            }
            Self::PlaceholderEnv(name) => {
                write!(
                    formatter,
                    "Environment variable {name} still contains a placeholder"
                )
            }
            Self::ShortAdminPassword => {
                write!(formatter, "ADMIN_PASSWORD must be at least 16 characters")
            }
            Self::ForbiddenGoogleOAuthEnv(names) => write!(
                formatter,
                "Remove direct Google OAuth env vars; use myClawTeam auth instead: {}",
                names.join(", ")
            ),
        }
    }
}

impl Error for ConfigError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            _ => None,
        }
    }
}

impl From<std::io::Error> for ConfigError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl ServerConfig {
    pub fn load() -> Result<Self, ConfigError> {
        let mut values = load_process_env();
        load_env_file_if_present(DEFAULT_ENV_FILE, &mut values)?;
        Self::from_values(&values)
    }

    fn from_values(values: &HashMap<String, String>) -> Result<Self, ConfigError> {
        for name in REQUIRED_ENV {
            require_env(values, name)?;
        }

        for name in URL_ENV {
            validate_url(values, name)?;
        }

        validate_database_url(values)?;
        validate_object_storage_prefix(values)?;
        validate_object_storage_endpoint(values)?;
        validate_admin_password(values)?;
        validate_no_google_oauth_secrets(values)?;

        Ok(Self {
            admin_password: require_env(values, "ADMIN_PASSWORD")?,
            auth: AuthConfig {
                app_token: require_env(values, "MCTAI_AUTH_APP_TOKEN")?,
                jwks_url: require_env(values, "MCTAI_AUTH_JWKS_URL")?,
                url: require_env(values, "MCTAI_AUTH_URL")?,
            },
            database_url: require_env(values, "DATABASE_URL")?,
            object_storage: ObjectStorageConfig {
                access_key_id: require_env(values, "OBJECT_STORAGE_ACCESS_KEY_ID")?,
                bucket: require_env(values, "OBJECT_STORAGE_BUCKET")?,
                endpoint: require_env(values, "OBJECT_STORAGE_ENDPOINT")?,
                force_path_style: require_boolean_env(values, "OBJECT_STORAGE_FORCE_PATH_STYLE")?,
                prefix: require_env(values, "OBJECT_STORAGE_PREFIX")?,
                region: require_env(values, "OBJECT_STORAGE_REGION")?,
                secret_access_key: require_env(values, "OBJECT_STORAGE_SECRET_ACCESS_KEY")?,
            },
            self_url: require_env(values, "SELF_URL")?,
        })
    }
}

fn load_process_env() -> HashMap<String, String> {
    env::vars().collect()
}

fn load_env_file_if_present(
    path: impl AsRef<Path>,
    values: &mut HashMap<String, String>,
) -> Result<(), ConfigError> {
    let path = path.as_ref();

    if !path.exists() {
        return Ok(());
    }

    let contents = fs::read_to_string(path)?;

    for line in contents.lines() {
        if let Some((key, value)) = parse_dotenv_line(line)? {
            values.entry(key).or_insert(value);
        }
    }

    Ok(())
}

fn parse_dotenv_line(line: &str) -> Result<Option<(String, String)>, ConfigError> {
    let trimmed = line.trim();

    if trimmed.is_empty() || trimmed.starts_with('#') {
        return Ok(None);
    }

    let Some((key, raw_value)) = trimmed.split_once('=') else {
        return Ok(None);
    };

    if !is_valid_env_key(key) {
        return Ok(None);
    }

    let value = unquote_value(raw_value.trim()).to_owned();

    Ok(Some((key.to_owned(), value)))
}

fn is_valid_env_key(key: &str) -> bool {
    let mut chars = key.chars();
    let Some(first) = chars.next() else {
        return false;
    };

    (first == '_' || first.is_ascii_alphabetic())
        && chars.all(|character| character == '_' || character.is_ascii_alphanumeric())
}

fn unquote_value(value: &str) -> &str {
    if value.len() >= 2
        && ((value.starts_with('"') && value.ends_with('"'))
            || (value.starts_with('\'') && value.ends_with('\'')))
    {
        &value[1..value.len() - 1]
    } else {
        value
    }
}

fn require_env(values: &HashMap<String, String>, name: &str) -> Result<String, ConfigError> {
    let Some(value) = values.get(name).map(|value| value.trim()) else {
        return Err(ConfigError::MissingEnv(name.to_owned()));
    };

    if value.is_empty() {
        return Err(ConfigError::MissingEnv(name.to_owned()));
    }

    if is_placeholder_value(value) {
        return Err(ConfigError::PlaceholderEnv(name.to_owned()));
    }

    Ok(value.to_owned())
}

fn require_boolean_env(values: &HashMap<String, String>, name: &str) -> Result<bool, ConfigError> {
    match require_env(values, name)?.to_lowercase().as_str() {
        "true" => Ok(true),
        "false" => Ok(false),
        _ => Err(ConfigError::InvalidBoolean {
            name: name.to_owned(),
        }),
    }
}

fn validate_url(values: &HashMap<String, String>, name: &str) -> Result<(), ConfigError> {
    let value = require_env(values, name)?;
    if is_valid_absolute_url(&value) {
        Ok(())
    } else {
        Err(ConfigError::InvalidUrl {
            name: name.to_owned(),
        })
    }
}

fn is_valid_absolute_url(value: &str) -> bool {
    let Some((scheme, remainder)) = value.split_once("://") else {
        return false;
    };

    !scheme.is_empty()
        && scheme.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '+' | '-' | '.')
        })
        && has_url_authority(remainder)
}

fn has_url_authority(remainder: &str) -> bool {
    if remainder.is_empty() || remainder.starts_with('/') {
        return false;
    }

    let authority = remainder.split(['/', '?', '#']).next().unwrap_or("");
    let host_port = authority
        .rsplit_once('@')
        .map_or(authority, |(_, host)| host);

    !host_port.is_empty() && !host_port.starts_with(':')
}

fn url_scheme(value: &str) -> Option<&str> {
    value.split_once("://").map(|(scheme, _)| scheme)
}

fn validate_database_url(values: &HashMap<String, String>) -> Result<(), ConfigError> {
    let database_url = require_env(values, "DATABASE_URL")?;
    let Some(scheme) = url_scheme(&database_url) else {
        return Err(ConfigError::InvalidDatabaseUrl);
    };

    if matches!(scheme, "postgres" | "postgresql") && is_valid_absolute_url(&database_url) {
        Ok(())
    } else {
        Err(ConfigError::InvalidDatabaseUrl)
    }
}

fn validate_object_storage_prefix(values: &HashMap<String, String>) -> Result<(), ConfigError> {
    let prefix = require_env(values, "OBJECT_STORAGE_PREFIX")?;

    if !prefix.ends_with('/') {
        return Err(ConfigError::InvalidObjectStoragePrefix(
            "OBJECT_STORAGE_PREFIX must end with \"/\"".to_owned(),
        ));
    }

    if prefix.starts_with('/') {
        return Err(ConfigError::InvalidObjectStoragePrefix(
            "OBJECT_STORAGE_PREFIX must be a relative prefix".to_owned(),
        ));
    }

    Ok(())
}

fn validate_object_storage_endpoint(values: &HashMap<String, String>) -> Result<(), ConfigError> {
    let endpoint = require_env(values, "OBJECT_STORAGE_ENDPOINT")?;

    if endpoint.contains("s3.invalid") {
        return Err(ConfigError::InvalidObjectStorageEndpoint);
    }

    validate_url(values, "OBJECT_STORAGE_ENDPOINT")
}

fn validate_admin_password(values: &HashMap<String, String>) -> Result<(), ConfigError> {
    let admin_password = require_env(values, "ADMIN_PASSWORD")?;

    if admin_password.len() < 16 {
        Err(ConfigError::ShortAdminPassword)
    } else {
        Ok(())
    }
}

fn validate_no_google_oauth_secrets(values: &HashMap<String, String>) -> Result<(), ConfigError> {
    let forbidden = FORBIDDEN_GOOGLE_ENV
        .iter()
        .filter(|name| {
            values
                .get(**name)
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false)
        })
        .map(|name| (*name).to_owned())
        .collect::<Vec<_>>();

    if forbidden.is_empty() {
        Ok(())
    } else {
        Err(ConfigError::ForbiddenGoogleOAuthEnv(forbidden))
    }
}

fn is_placeholder_value(value: &str) -> bool {
    let lower = value.to_lowercase();

    lower == "app_token_from_myclawteam"
        || lower.starts_with("object-storage-")
        || lower.starts_with("replace-with-")
        || lower.starts_with("postgresql://user:password@host")
}
