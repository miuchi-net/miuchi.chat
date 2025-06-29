use axum::{
    extract::{Query, State},
    response::Json,
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use utoipa::{IntoParams, ToSchema};

use super::chat::{Message, MessageType};

#[derive(Deserialize, IntoParams)]
pub struct SearchQuery {
    pub q: String,
    pub room: Option<String>,
    pub author: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Serialize, ToSchema)]
pub struct SearchResult {
    pub message: Message,
    pub highlights: Vec<String>,
    pub score: f64,
}

#[derive(Serialize, ToSchema)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub total_hits: u64,
    pub query_time_ms: u32,
    pub has_more: bool,
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/", get(search_messages))
}

#[utoipa::path(
    get,
    path = "/search",
    params(SearchQuery),
    responses(
        (status = 200, description = "Search completed successfully", body = SearchResponse),
        (status = 400, description = "Invalid search parameters"),
        (status = 401, description = "Unauthorized")
    ),
    tag = "Search",
    security(
        ("bearer_auth" = [])
    )
)]
async fn search_messages(
    Query(params): Query<SearchQuery>,
    State(_pool): State<PgPool>,
) -> Json<SearchResponse> {
    let _limit = params.limit.unwrap_or(20).min(100);
    
    Json(SearchResponse {
        results: vec![
            SearchResult {
                message: Message {
                    id: "msg_search_1".to_string(),
                    room_id: params.room.unwrap_or("general".to_string()),
                    user_id: "user_123".to_string(),
                    username: "dev_user".to_string(),
                    content: format!("Found message containing '{}'", params.q),
                    timestamp: chrono::Utc::now(),
                    message_type: MessageType::Text,
                },
                highlights: vec![params.q.clone()],
                score: 0.95,
            }
        ],
        total_hits: 1,
        query_time_ms: 15,
        has_more: false,
    })
}