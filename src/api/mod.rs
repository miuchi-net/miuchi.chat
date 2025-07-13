use axum::Router;
use meilisearch_sdk::client::Client as MeilisearchClient;
use sqlx::PgPool;

pub mod auth;
pub mod chat;
pub mod response;
pub mod search;

pub fn create_router() -> Router<(PgPool, MeilisearchClient)> {
    Router::new()
        .nest("/auth", auth::router())
        .nest("/search", search::router())
}

pub fn create_chat_router() -> Router<(PgPool, crate::ws::AppState, MeilisearchClient)> {
    Router::new().nest("/api/chat", chat::router())
}
