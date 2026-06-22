use crate::{admin::AdminAuth, auth::AuthVerifier, db::Database, storage::StorageService};

#[derive(Clone)]
pub struct AppState {
    pub admin: AdminAuth,
    #[allow(dead_code)]
    pub ai_news_bot_api_token: String,
    #[allow(dead_code)]
    pub auth: AuthVerifier,
    #[allow(dead_code)]
    pub database: Database,
    pub storage: StorageService,
}
