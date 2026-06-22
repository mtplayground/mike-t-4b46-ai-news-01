use crate::{auth::AuthVerifier, db::Database};

#[derive(Clone)]
pub struct AppState {
    #[allow(dead_code)]
    pub auth: AuthVerifier,
    #[allow(dead_code)]
    pub database: Database,
}
