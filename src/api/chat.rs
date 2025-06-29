use axum::{
    extract::{Path, Query, State},
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use utoipa::{IntoParams, ToSchema};

use crate::models::{Message as DbMessage, Room, DbMessageType};
use crate::api::auth::AuthUser;

#[derive(Serialize, Deserialize, ToSchema)]
pub struct Message {
    pub id: String,
    pub room_id: String,
    pub user_id: String,
    pub username: String,
    pub content: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub message_type: MessageType,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub enum MessageType {
    Text,
    Image,
    File,
    System,
}

#[derive(Deserialize, IntoParams)]
pub struct MessagesQuery {
    pub limit: Option<u32>,
    pub from: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct SendMessageRequest {
    pub content: String,
    pub message_type: Option<MessageType>,
}

#[derive(Serialize, ToSchema)]
pub struct SendMessageResponse {
    pub message_id: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, ToSchema)]
pub struct MessagesResponse {
    pub messages: Vec<Message>,
    pub has_more: bool,
    pub next_cursor: Option<String>,
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/{room}/messages", get(get_messages))
        .route("/{room}/send", post(send_message))
}

#[utoipa::path(
    get,
    path = "/chat/{room}/messages",
    params(
        ("room" = String, Path, description = "Room ID"),
        MessagesQuery
    ),
    responses(
        (status = 200, description = "Messages retrieved successfully", body = MessagesResponse),
        (status = 404, description = "Room not found")
    ),
    tag = "Chat"
)]
async fn get_messages(
    Path(room_name): Path<String>,
    Query(params): Query<MessagesQuery>,
    State(pool): State<PgPool>,
) -> Result<Json<MessagesResponse>, axum::http::StatusCode> {
    let limit = params.limit.unwrap_or(50).min(100) as i64;
    
    // ルーム名からルームを検索
    let room = Room::find_by_name(&pool, &room_name)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(axum::http::StatusCode::NOT_FOUND)?;
    
    // フロムパラメータをUUIDにパース
    let before_id = if let Some(from_str) = &params.from {
        Some(from_str.parse::<uuid::Uuid>()
            .map_err(|_| axum::http::StatusCode::BAD_REQUEST)?)
    } else {
        None
    };
    
    // メッセージを取得
    let db_messages = DbMessage::find_by_room_with_users(&pool, room.id, limit, before_id)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let has_more = db_messages.len() == limit as usize;
    let next_cursor = db_messages.last().map(|msg| msg.id.to_string());
    
    // APIレスポンス形式に変換
    let messages: Vec<Message> = db_messages.into_iter().map(|msg| {
        Message {
            id: msg.id.to_string(),
            room_id: msg.room_id.to_string(),
            user_id: msg.user_id.to_string(),
            username: msg.username,
            content: msg.content,
            timestamp: msg.created_at,
            message_type: match msg.message_type {
                DbMessageType::Text => MessageType::Text,
                DbMessageType::Image => MessageType::Image,
                DbMessageType::File => MessageType::File,
                DbMessageType::System => MessageType::System,
            },
        }
    }).collect();
    
    Ok(Json(MessagesResponse {
        messages,
        has_more,
        next_cursor,
    }))
}

#[utoipa::path(
    post,
    path = "/chat/{room}/send",
    params(
        ("room" = String, Path, description = "Room ID")
    ),
    request_body = SendMessageRequest,
    responses(
        (status = 200, description = "Message sent successfully", body = SendMessageResponse),
        (status = 400, description = "Invalid message content"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Room not found")
    ),
    tag = "Chat",
    security(
        ("bearer_auth" = [])
    )
)]
async fn send_message(
    Path(room_name): Path<String>,
    State(pool): State<PgPool>,
    user: AuthUser,
    Json(payload): Json<SendMessageRequest>,
) -> Result<Json<SendMessageResponse>, axum::http::StatusCode> {
    // ルーム名からルームを検索
    let room = Room::find_by_name(&pool, &room_name)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(axum::http::StatusCode::NOT_FOUND)?;
    
    // ユーザーIDをUUIDにパース
    let user_id = user.user_id.parse::<uuid::Uuid>()
        .map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;
    
    // ユーザーがルームのメンバーかチェック
    let is_member = room.is_member(&pool, user_id)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    
    if !is_member {
        return Err(axum::http::StatusCode::FORBIDDEN);
    }
    
    // メッセージタイプを変換
    let db_message_type = match payload.message_type.unwrap_or(MessageType::Text) {
        MessageType::Text => DbMessageType::Text,
        MessageType::Image => DbMessageType::Image,
        MessageType::File => DbMessageType::File,
        MessageType::System => DbMessageType::System,
    };
    
    // メッセージを作成
    let message = DbMessage::create(
        &pool,
        room.id,
        user_id,
        payload.content,
        db_message_type,
    )
    .await
    .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(Json(SendMessageResponse {
        message_id: message.id.to_string(),
        timestamp: message.created_at,
    }))
}