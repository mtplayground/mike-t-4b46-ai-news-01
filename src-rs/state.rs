use crate::{admin::AdminAuth, auth::AuthVerifier, db::Database};

#[derive(Clone)]
pub struct AppState {
    pub admin: AdminAuth,
    #[allow(dead_code)]
    pub auth: AuthVerifier,
    #[allow(dead_code)]
    pub database: Database,
}
