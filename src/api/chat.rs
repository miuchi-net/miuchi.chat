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

#[derive(Deserialize, ToSchema)]
pub struct CreateRoomRequest {
    pub name: String,
    pub description: Option<String>,
    pub is_public: bool,
}

#[derive(Serialize, ToSchema)]
pub struct CreateRoomResponse {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_public: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, ToSchema)]
pub struct RoomMember {
    pub user_id: String,
    pub username: String,
    pub joined_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, ToSchema)]
pub struct RoomMembersResponse {
    pub members: Vec<RoomMember>,
}

#[derive(Serialize, ToSchema)]
pub struct RoomInfo {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_public: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, ToSchema)]
pub struct RoomsResponse {
    pub rooms: Vec<RoomInfo>,
}

#[derive(Deserialize, ToSchema)]
pub struct InviteUserRequest {
    pub username: String,
}

#[derive(Serialize, ToSchema)]
pub struct InviteUserResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Serialize, ToSchema)]
pub struct OnlineUser {
    pub user_id: String,
    pub username: String,
    pub connected_rooms: Vec<String>,
    pub connected_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, ToSchema)]
pub struct OnlineUsersResponse {
    pub users: Vec<OnlineUser>,
    pub total_count: usize,
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

pub fn router() -> Router<(PgPool, crate::ws::AppState)> {
    Router::new()
        .route("/rooms", get(get_rooms).post(create_room))
        .route("/online-users", get(get_online_users))
        .route("/{room}/messages", get(get_messages))
        .route("/{room}/send", post(send_message))
        .route("/{room}/members", get(get_room_members))
        .route("/{room}/invite", post(invite_user))
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
    State(state): State<(PgPool, crate::ws::AppState)>,
) -> Result<Json<MessagesResponse>, axum::http::StatusCode> {
    let pool = &state.0;
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
    State(state): State<(PgPool, crate::ws::AppState)>,
    user: AuthUser,
    Json(payload): Json<SendMessageRequest>,
) -> Result<Json<SendMessageResponse>, axum::http::StatusCode> {
    let pool = &state.0;
    // ルーム名からルームを検索
    let room = Room::find_by_name(&pool, &room_name)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(axum::http::StatusCode::NOT_FOUND)?;
    
    // ユーザーIDをUUIDにパース
    let user_id = user.user_id.parse::<uuid::Uuid>()
        .map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;
    
    // パブリックルームでない場合のみメンバーシップをチェック
    if !room.is_public {
        let is_member = room.is_member(&pool, user_id)
            .await
            .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
        
        if !is_member {
            return Err(axum::http::StatusCode::FORBIDDEN);
        }
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

#[utoipa::path(
    post,
    path = "/chat/rooms",
    request_body = CreateRoomRequest,
    responses(
        (status = 200, description = "Room created successfully", body = CreateRoomResponse),
        (status = 400, description = "Invalid room data"),
        (status = 401, description = "Unauthorized"),
        (status = 409, description = "Room name already exists")
    ),
    tag = "Chat",
    security(
        ("bearer_auth" = [])
    )
)]
async fn create_room(
    State(state): State<(PgPool, crate::ws::AppState)>,
    user: AuthUser,
    Json(payload): Json<CreateRoomRequest>,
) -> Result<Json<CreateRoomResponse>, axum::http::StatusCode> {
    let pool = &state.0;
    // バリデーション
    if payload.name.is_empty() || payload.name.len() > 100 {
        return Err(axum::http::StatusCode::BAD_REQUEST);
    }
    
    // ユーザーIDをUUIDにパース
    let user_id = user.user_id.parse::<uuid::Uuid>()
        .map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;
    
    // ルーム名の重複チェック
    if Room::find_by_name(&pool, &payload.name).await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?.is_some() {
        return Err(axum::http::StatusCode::CONFLICT);
    }
    
    // ルームを作成
    let room = Room::create(
        &pool,
        payload.name.clone(),
        payload.description.clone(),
        user_id,
        payload.is_public,
    )
    .await
    .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // プライベートルームの場合、作成者をメンバーに追加
    if !payload.is_public {
        room.add_member(&pool, user_id)
            .await
            .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    
    Ok(Json(CreateRoomResponse {
        id: room.id.to_string(),
        name: room.name,
        description: room.description,
        is_public: room.is_public,
        created_at: room.created_at,
    }))
}

#[utoipa::path(
    get,
    path = "/chat/{room}/members",
    params(
        ("room" = String, Path, description = "Room ID or name")
    ),
    responses(
        (status = 200, description = "Room members retrieved successfully", body = RoomMembersResponse),
        (status = 404, description = "Room not found"),
        (status = 403, description = "Access denied")
    ),
    tag = "Chat",
    security(
        ("bearer_auth" = [])
    )
)]
async fn get_room_members(
    Path(room_name): Path<String>,
    State(state): State<(PgPool, crate::ws::AppState)>,
    user: AuthUser,
) -> Result<Json<RoomMembersResponse>, axum::http::StatusCode> {
    let pool = &state.0;
    // ユーザーIDをUUIDにパース
    let user_id = user.user_id.parse::<uuid::Uuid>()
        .map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;
    
    // ルーム名からルームを検索
    let room = Room::find_by_name(&pool, &room_name)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(axum::http::StatusCode::NOT_FOUND)?;
    
    // プライベートルームの場合、ユーザーがメンバーかチェック
    if !room.is_public {
        let is_member = room.is_member(&pool, user_id)
            .await
            .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
        
        if !is_member {
            return Err(axum::http::StatusCode::FORBIDDEN);
        }
    }
    
    // ルームメンバーを取得
    let members = room.get_members(&pool)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let response_members: Vec<RoomMember> = members.into_iter().map(|member| RoomMember {
        user_id: member.user_id.to_string(),
        username: member.username,
        joined_at: member.joined_at,
    }).collect();
    
    Ok(Json(RoomMembersResponse {
        members: response_members,
    }))
}

#[utoipa::path(
    get,
    path = "/chat/rooms",
    responses(
        (status = 200, description = "Rooms retrieved successfully", body = RoomsResponse),
        (status = 401, description = "Unauthorized")
    ),
    tag = "Chat",
    security(
        ("bearer_auth" = [])
    )
)]
async fn get_rooms(
    State(state): State<(PgPool, crate::ws::AppState)>,
    user: AuthUser,
) -> Result<Json<RoomsResponse>, axum::http::StatusCode> {
    let pool = &state.0;
    // ユーザーIDをUUIDにパース
    let user_id = user.user_id.parse::<uuid::Uuid>()
        .map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;
    
    // ユーザーがアクセス可能なルームを取得
    let rooms = Room::get_accessible_rooms(&pool, user_id)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let response_rooms: Vec<RoomInfo> = rooms.into_iter().map(|room| RoomInfo {
        id: room.id.to_string(),
        name: room.name,
        description: room.description,
        is_public: room.is_public,
        created_at: room.created_at,
    }).collect();
    
    Ok(Json(RoomsResponse {
        rooms: response_rooms,
    }))
}

#[utoipa::path(
    post,
    path = "/chat/{room}/invite",
    params(
        ("room" = String, Path, description = "Room name")
    ),
    request_body = InviteUserRequest,
    responses(
        (status = 200, description = "User invited successfully", body = InviteUserResponse),
        (status = 400, description = "Invalid request"),
        (status = 403, description = "Access denied"),
        (status = 404, description = "Room or user not found"),
        (status = 409, description = "User is already a member")
    ),
    tag = "Chat",
    security(
        ("bearer_auth" = [])
    )
)]
async fn invite_user(
    Path(room_name): Path<String>,
    State(state): State<(PgPool, crate::ws::AppState)>,
    user: AuthUser,
    Json(payload): Json<InviteUserRequest>,
) -> Result<Json<InviteUserResponse>, axum::http::StatusCode> {
    let pool = &state.0;
    // ユーザーIDをUUIDにパース
    let user_id = user.user_id.parse::<uuid::Uuid>()
        .map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;
    
    // ルームを検索
    let room = Room::find_by_name(&pool, &room_name)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(axum::http::StatusCode::NOT_FOUND)?;
    
    // パブリックルームには招待できない
    if room.is_public {
        return Ok(Json(InviteUserResponse {
            success: false,
            message: "パブリックルームには招待は必要ありません".to_string(),
        }));
    }
    
    // 現在のユーザーがルームのメンバーかチェック
    let is_member = room.is_member(&pool, user_id)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    
    if !is_member {
        return Err(axum::http::StatusCode::FORBIDDEN);
    }
    
    // 招待対象ユーザーを検索
    let target_user = crate::models::User::find_by_username(&pool, &payload.username)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or_else(|| axum::http::StatusCode::NOT_FOUND)?;
    
    // 既にメンバーかどうかチェック
    let is_already_member = room.is_member(&pool, target_user.id)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    
    if is_already_member {
        return Ok(Json(InviteUserResponse {
            success: false,
            message: format!("{}は既にメンバーです", payload.username),
        }));
    }
    
    // ユーザーをルームに追加
    room.add_member(&pool, target_user.id)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(Json(InviteUserResponse {
        success: true,
        message: format!("{}をルームに招待しました", payload.username),
    }))
}

#[utoipa::path(
    get,
    path = "/chat/online-users",
    responses(
        (status = 200, description = "Online users retrieved successfully", body = OnlineUsersResponse),
        (status = 401, description = "Unauthorized")
    ),
    tag = "Chat",
    security(
        ("bearer_auth" = [])
    )
)]
async fn get_online_users(
    State(state): State<(PgPool, crate::ws::AppState)>,
    user: AuthUser, // 認証チェック
) -> Result<Json<OnlineUsersResponse>, axum::http::StatusCode> {
    let ws_state = &state.1;
    // WebSocket状態から実際のオンラインユーザー情報を取得
    let online_users_info = crate::ws::get_online_users_info(&ws_state).await;
    
    let online_users: Vec<OnlineUser> = online_users_info
        .into_iter()
        .map(|(user_id, username, rooms, connected_at)| {
            // std::time::Instant を chrono::DateTime<Utc> に変換
            let connected_at_utc = chrono::Utc::now() - chrono::Duration::from_std(connected_at.elapsed())
                .unwrap_or_else(|_| chrono::Duration::zero());
            
            OnlineUser {
                user_id: user_id.to_string(),
                username,
                connected_rooms: rooms,
                connected_at: connected_at_utc,
            }
        })
        .collect();
    
    let total_count = online_users.len();
    
    Ok(Json(OnlineUsersResponse {
        users: online_users,
        total_count,
    }))
}