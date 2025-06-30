use axum::Router;
use sqlx::PgPool;

pub mod auth;
pub mod chat;
pub mod search;

pub fn create_router() -> Router<PgPool> {
    Router::new()
        .nest("/auth", auth::router())
        .nest("/search", search::router())
}

pub fn create_chat_router() -> Router<(PgPool, crate::ws::AppState)> {
    Router::new()
        .nest("/api/chat", chat::router())
}