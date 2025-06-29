use axum::Router;
use sqlx::PgPool;

pub mod auth;
pub mod chat;
pub mod search;

pub fn create_router() -> Router<PgPool> {
    Router::new()
        .nest("/auth", auth::router())
        .nest("/chat", chat::router())
        .nest("/search", search::router())
}