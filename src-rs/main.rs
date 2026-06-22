mod admin;
mod auth;
mod authorization;
mod config;
mod db;
mod models;
mod state;

use std::{env, error::Error, net::SocketAddr};

use admin::{router as admin_router, AdminAuth};
use auth::{router as auth_router, AuthVerifier};
use axum::{http::StatusCode, response::IntoResponse, routing::get, Router};
use config::ServerConfig;
use db::Database;
use state::AppState;
use tokio::{net::TcpListener, signal};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

const DEFAULT_HOST: &str = "0.0.0.0";
const DEFAULT_PORT: u16 = 8080;

type AppResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

#[tokio::main]
async fn main() -> AppResult<()> {
    init_tracing();

    let config = ServerConfig::load()?;
    let database = Database::connect(&config)?;
    let secure_cookies = env::var("NODE_ENV").is_ok_and(|value| value == "production");
    let auth = AuthVerifier::new(
        config.auth.clone(),
        database.clone(),
        config.self_url.clone(),
        secure_cookies,
    );
    let admin = AdminAuth::new(
        config.admin_password.clone(),
        database.clone(),
        secure_cookies,
    );
    let state = AppState {
        admin,
        auth,
        database,
    };
    let addr = listen_addr()?;
    let app = build_router(state);
    let listener = TcpListener::bind(addr).await?;

    info!(%addr, self_url = %config.self_url, "starting Axum API server");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

fn init_tracing() {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("mike_t_4b46_ai_news_01_api=info,tower_http=info"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer())
        .init();
}

fn build_router(state: AppState) -> Router {
    Router::new()
        .merge(admin_router())
        .merge(auth_router())
        .route("/health", get(health_check))
        .route("/api/health", get(health_check))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn health_check() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

fn listen_addr() -> AppResult<SocketAddr> {
    let host = env::var("HOST").unwrap_or_else(|_| DEFAULT_HOST.to_owned());
    let port = match env::var("PORT") {
        Ok(value) => value
            .parse::<u16>()
            .map_err(|err| format!("PORT must be a valid u16: {err}"))?,
        Err(_) => DEFAULT_PORT,
    };

    format!("{host}:{port}")
        .parse::<SocketAddr>()
        .map_err(|err| format!("HOST/PORT produced an invalid listen address: {err}").into())
}

async fn shutdown_signal() {
    if let Err(error) = signal::ctrl_c().await {
        tracing::warn!(%error, "failed to listen for shutdown signal");
    }
}
