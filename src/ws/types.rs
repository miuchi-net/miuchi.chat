use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Instant,
};
use tokio::sync::{broadcast, RwLock, Semaphore};
use uuid::Uuid;

// WebSocketでやり取りするメッセージの形式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WsMessage {
    // クライアントからサーバーへ
    #[serde(rename = "join_room")]
    JoinRoom { room: String },
    #[serde(rename = "send_message")]
    SendMessage {
        room: String,
        content: String,
        message_type: Option<String>,
    },
    #[serde(rename = "leave_room")]
    LeaveRoom { room: String },
    #[serde(rename = "ping")]
    Ping { timestamp: Option<u64> },

    // サーバーからクライアントへ
    #[serde(rename = "room_joined")]
    RoomJoined {
        room: String,
        user_id: String,
        username: String,
    },
    #[serde(rename = "message")]
    Message {
        id: String,
        room: String,
        user_id: String,
        username: String,
        content: String,
        message_type: String,
        timestamp: DateTime<Utc>,
    },
    #[serde(rename = "user_joined")]
    UserJoined {
        room: String,
        user_id: String,
        username: String,
    },
    #[serde(rename = "user_left")]
    UserLeft {
        room: String,
        user_id: String,
        username: String,
    },
    #[serde(rename = "pong")]
    Pong { timestamp: Option<u64> },
    #[serde(rename = "error")]
    Error { message: String, code: Option<u16> },
    #[serde(rename = "auth_required")]
    AuthRequired,
    #[serde(rename = "rate_limited")]
    RateLimited { retry_after: u64 },
}

// 接続中のクライアント情報
#[derive(Debug)]
pub struct ConnectedClient {
    pub user_id: Uuid,
    pub username: String,
    pub rooms: Vec<String>,
    pub sender: broadcast::Sender<WsMessage>,
    pub connected_at: Instant,
    pub last_activity: Arc<RwLock<Instant>>,
    pub message_count: AtomicU64,
    pub rate_limiter: Arc<Semaphore>,
}

impl Clone for ConnectedClient {
    fn clone(&self) -> Self {
        Self {
            user_id: self.user_id,
            username: self.username.clone(),
            rooms: self.rooms.clone(),
            sender: self.sender.clone(),
            connected_at: self.connected_at,
            last_activity: self.last_activity.clone(),
            message_count: AtomicU64::new(self.message_count.load(Ordering::Relaxed)),
            rate_limiter: self.rate_limiter.clone(),
        }
    }
}

#[derive(Deserialize)]
pub struct WsQuery {
    pub token: Option<String>,
}