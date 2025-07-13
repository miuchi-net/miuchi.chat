use axum::{
    response::{Html, Json},
    routing::get,
    Router,
};
use meilisearch_sdk::client::Client as MeilisearchClient;
use serde_json::{json, Value};
use sqlx::PgPool;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;

pub mod api;
pub mod error;
pub mod models;
pub mod ws;

pub use error::{AppError, AppResult};

/// テスト用のアプリケーション作成関数
pub async fn create_app(pool: PgPool, meili_client: MeilisearchClient) -> Router {
    // WebSocket用の状態管理を初期化
    let ws_state: ws::AppState = Arc::new(RwLock::new(HashMap::new()));

    Router::new()
        .route("/", get(root))
        .route("/health", get(health_check))
        .route("/db-health", get(db_health_check))
        .nest(
            "/api",
            api::create_router().with_state((pool.clone(), meili_client.clone())),
        )
        .merge(api::create_chat_router())
        .route("/ws", get(ws::websocket_handler))
        .with_state((pool, ws_state, meili_client))
        .layer(CorsLayer::permissive())
}

async fn root() -> Json<Value> {
    Json(json!({
        "message": "miuchi.chat API",
        "version": "0.1.0"
    }))
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now()
    }))
}

async fn db_health_check(
    axum::extract::State((pool, _, _)): axum::extract::State<(PgPool, ws::AppState, MeilisearchClient)>,
) -> Json<Value> {
    match sqlx::query("SELECT 1").execute(&pool).await {
        Ok(_) => Json(json!({
            "status": "healthy",
            "database": "connected",
            "timestamp": chrono::Utc::now()
        })),
        Err(e) => Json(json!({
            "status": "unhealthy",
            "database": "disconnected",
            "error": e.to_string(),
            "timestamp": chrono::Utc::now()
        })),
    }
}
