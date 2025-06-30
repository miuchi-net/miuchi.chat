use axum::{
    extract::{Query, State},
    response::Json,
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use utoipa::{IntoParams, ToSchema};
use meilisearch_sdk::client::Client as MeilisearchClient;

use super::chat::{Message, MessageType};
use super::auth::AuthUser;

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

pub fn router() -> Router<(PgPool, MeilisearchClient)> {
    Router::new()
        .route("/messages", get(search_messages))
}

#[utoipa::path(
    get,
    path = "/search/messages",
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
    State((_pool, meili_client)): State<(PgPool, MeilisearchClient)>,
    _user: AuthUser, // 認証チェック
) -> Result<Json<SearchResponse>, axum::http::StatusCode> {
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);
    
    // Meilisearchで検索実行
    let index = meili_client.index("messages");
    
    // フィルター条件を構築
    let mut filters = Vec::new();
    if let Some(room) = &params.room {
        filters.push(format!("room_name = '{}'", room));
    }
    if let Some(author) = &params.author {
        filters.push(format!("author_name = '{}'", author));
    }
    let filter_string = if !filters.is_empty() {
        Some(filters.join(" AND "))
    } else {
        None
    };

    let mut search_query = index.search();
    search_query
        .with_query(&params.q)
        .with_limit(limit as usize)
        .with_offset(offset as usize)
        .with_attributes_to_highlight(meilisearch_sdk::search::Selectors::Some(&["content"]))
        .with_highlight_pre_tag("<mark>")
        .with_highlight_post_tag("</mark>");
    
    if let Some(filter) = &filter_string {
        search_query.with_filter(filter);
    }
    
    let search_results = match search_query.execute::<serde_json::Value>().await {
        Ok(results) => results,
        Err(e) => {
            tracing::error!("Meilisearch error: {}", e);
            return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR);
        }
    };
    
    let mut results = Vec::new();
    
    for hit in &search_results.hits {
        // hit.resultがドキュメントデータを含む
        let message_data = Message {
            id: hit.result.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            room_id: hit.result.get("room_id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            author_id: hit.result.get("author_id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            author_name: hit.result.get("author_name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            author_avatar: hit.result.get("author_avatar").and_then(|v| v.as_str()).map(|s| s.to_string()),
            content: hit.result.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            created_at: chrono::DateTime::from_timestamp(
                hit.result.get("created_at").and_then(|v| v.as_i64()).unwrap_or(0), 0
            ).unwrap_or_default(),
            message_type: match hit.result.get("message_type").and_then(|v| v.as_str()).unwrap_or("text") {
                "image" => MessageType::Image,
                "file" => MessageType::File,
                "system" => MessageType::System,
                _ => MessageType::Text,
            },
        };
        
        let highlights = if let Some(formatted) = &hit.formatted_result {
            if let Some(content) = formatted.get("content").and_then(|v| v.as_str()) {
                vec![content.to_string()]
            } else {
                vec![]
            }
        } else {
            vec![]
        };
        
        results.push(SearchResult {
            message: message_data,
            highlights,
            score: hit.ranking_score.unwrap_or(0.0),
        });
    }
    
    let total_hits = search_results.estimated_total_hits.map(|h| h as u64).unwrap_or(search_results.hits.len() as u64);
    
    Ok(Json(SearchResponse {
        results,
        total_hits,
        query_time_ms: search_results.processing_time_ms as u32,
        has_more: (offset + limit) < total_hits as u32,
    }))
}