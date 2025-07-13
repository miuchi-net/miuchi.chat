use axum::{
    extract::{
        ws::{CloseFrame, Message, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    response::Response,
};
use chrono::{DateTime, Utc};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tokio::{
    sync::{broadcast, RwLock, Semaphore},
    time::{interval, timeout},
};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::models::{DbMessageType, Message as DbMessage, Room, User};

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

    // WebRTC シグナリング用
    #[serde(rename = "webrtc_offer")]
    WebRtcOffer {
        room: String,
        to_user_id: String,
        offer: serde_json::Value,
    },
    #[serde(rename = "webrtc_answer")]
    WebRtcAnswer {
        room: String,
        to_user_id: String,
        answer: serde_json::Value,
    },
    #[serde(rename = "webrtc_ice_candidate")]
    WebRtcIceCandidate {
        room: String,
        to_user_id: String,
        candidate: serde_json::Value,
    },

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

// 全体の状態管理
pub type AppState = Arc<RwLock<HashMap<String, HashMap<Uuid, ConnectedClient>>>>;

// ユーザーベースの接続管理を追加
pub type UserConnections = Arc<RwLock<HashMap<Uuid, usize>>>;

#[derive(Deserialize)]
pub struct WsQuery {
    token: Option<String>,
}

// WebSocket接続の設定
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
const CLIENT_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_MESSAGE_SIZE: usize = 64 * 1024; // 64KB
const RATE_LIMIT_MESSAGES: usize = 10; // 10 messages per window
const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(1);
const MAX_CONNECTIONS_PER_USER: usize = 5;
const WEBSOCKET_TIMEOUT: Duration = Duration::from_secs(5);

// WebSocket接続のアップグレード処理
pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
    State((pool, app_state, meili_client)): State<(
        PgPool,
        AppState,
        meilisearch_sdk::client::Client,
    )>,
) -> Response {
    // トークンが必要
    let token = match query.token {
        Some(token) => token,
        None => {
            warn!("WebSocket connection attempt without token");
            return ws.on_upgrade(|mut socket| async move {
                let _ = socket.close().await;
            });
        }
    };

    // 事前認証
    let user = match verify_jwt_token(&token, &pool).await {
        Ok(user) => user,
        Err(e) => {
            warn!("WebSocket authentication failed: {}", e);
            return ws.on_upgrade(|mut socket| async move {
                let _ = socket.close().await;
            });
        }
    };

    info!(
        "WebSocket connection established for user: {} ({})",
        user.username, user.id
    );

    ws.on_upgrade(move |socket| websocket_connection(socket, user, pool, app_state, meili_client))
}

// WebSocket接続の処理
async fn websocket_connection(
    socket: WebSocket,
    user: User,
    pool: PgPool,
    app_state: AppState,
    meili_client: meilisearch_sdk::client::Client,
) {
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = broadcast::channel::<WsMessage>(100);

    // クライアント情報を初期化
    let client = ConnectedClient {
        user_id: user.id,
        username: user.username.clone(),
        rooms: Vec::new(),
        sender: tx.clone(),
        connected_at: Instant::now(),
        last_activity: Arc::new(RwLock::new(Instant::now())),
        message_count: AtomicU64::new(0),
        rate_limiter: Arc::new(Semaphore::new(RATE_LIMIT_MESSAGES)),
    };

    let user_id = user.id;
    let username = user.username.clone();
    let username_for_heartbeat = username.clone();
    let username_for_handler = username.clone();
    let username_for_cleanup = username.clone();

    // 接続数制限をチェック
    if let Err(e) = check_connection_limit(user_id, &app_state).await {
        warn!(
            "Connection limit exceeded for user {}: {}",
            username_for_cleanup, e
        );
        let _ = sender
            .send(Message::Close(Some(CloseFrame {
                code: axum::extract::ws::close_code::POLICY,
                reason: "Connection limit exceeded".into(),
            })))
            .await;
        return;
    }

    // ハートビートタスク
    let heartbeat_tx = tx.clone();
    let last_activity_heartbeat = client.last_activity.clone();
    let heartbeat_task = tokio::spawn(async move {
        let mut interval = interval(HEARTBEAT_INTERVAL);
        loop {
            interval.tick().await;

            // 最後のアクティビティをチェック
            let last_activity = *last_activity_heartbeat.read().await;
            if last_activity.elapsed() > CLIENT_TIMEOUT {
                warn!("Client {} timed out", username_for_heartbeat);
                let _ = heartbeat_tx.send(WsMessage::Error {
                    message: "Connection timed out".to_string(),
                    code: Some(1001),
                });
                break;
            }

            // Pingを送信
            if heartbeat_tx
                .send(WsMessage::Ping {
                    timestamp: Some(chrono::Utc::now().timestamp_millis() as u64),
                })
                .is_err()
            {
                break;
            }
        }
    });

    // メッセージ送信タスク
    let send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let json_str = match serde_json::to_string(&msg) {
                Ok(json) => json,
                Err(e) => {
                    error!("Failed to serialize WebSocket message: {}", e);
                    match serde_json::to_string(&WsMessage::Error {
                        message: "Internal serialization error".to_string(),
                        code: Some(1011),
                    }) {
                        Ok(error_json) => error_json,
                        Err(_) => break, // If we can't even serialize an error, abort
                    }
                }
            };

            // メッセージサイズチェック
            if json_str.len() > MAX_MESSAGE_SIZE {
                warn!("Message too large, dropping: {} bytes", json_str.len());
                continue;
            }

            // タイムアウト付きで送信
            match timeout(
                WEBSOCKET_TIMEOUT,
                sender.send(Message::Text(json_str.into())),
            )
            .await
            {
                Ok(Ok(_)) => {}
                Ok(Err(_)) | Err(_) => {
                    debug!("WebSocket send failed or timed out");
                    break;
                }
            }
        }
    });

    // メッセージ受信と処理
    let client_for_handler = client.clone();
    while let Some(msg) = receiver.next().await {
        // 最後のアクティビティを更新
        *client.last_activity.write().await = Instant::now();

        match msg {
            Ok(Message::Text(text)) => {
                // メッセージサイズチェック
                if text.len() > MAX_MESSAGE_SIZE {
                    warn!(
                        "Received message too large from {}: {} bytes",
                        username_for_handler,
                        text.len()
                    );
                    let _ = tx.send(WsMessage::Error {
                        message: "Message too large".to_string(),
                        code: Some(1009),
                    });
                    continue;
                }

                // レート制限チェック
                if client.rate_limiter.try_acquire().is_err() {
                    warn!("Rate limit exceeded for user {}", username);
                    let _ = tx.send(WsMessage::RateLimited {
                        retry_after: RATE_LIMIT_WINDOW.as_secs(),
                    });
                    continue;
                }

                // メッセージカウント更新
                client.message_count.fetch_add(1, Ordering::Relaxed);

                match serde_json::from_str::<WsMessage>(&text) {
                    Ok(ws_msg) => {
                        match handle_websocket_message(
                            ws_msg,
                            &user,
                            &client_for_handler,
                            &pool,
                            &app_state,
                            &tx,
                            &meili_client,
                        )
                        .await
                        {
                            Ok(_) => {
                                debug!(
                                    "WebSocket message handled successfully for user {}",
                                    username_for_handler
                                );
                            }
                            Err(err) => {
                                warn!(
                                    "WebSocket message handling error for user {}: {}",
                                    username_for_handler, err
                                );
                                let _ = tx.send(WsMessage::Error {
                                    message: err.to_string(),
                                    code: Some(1002),
                                });
                            }
                        }
                    }
                    Err(e) => {
                        warn!("Invalid JSON from user {}: {}", username_for_handler, e);
                        let _ = tx.send(WsMessage::Error {
                            message: "Invalid JSON format".to_string(),
                            code: Some(1003),
                        });
                    }
                }
            }
            Ok(Message::Binary(_)) => {
                warn!(
                    "Binary messages not supported from user {}",
                    username_for_handler
                );
                let _ = tx.send(WsMessage::Error {
                    message: "Binary messages not supported".to_string(),
                    code: Some(1003),
                });
            }
            Ok(Message::Close(frame)) => {
                info!(
                    "WebSocket connection closed by client {}: {:?}",
                    username_for_handler, frame
                );
                break;
            }
            Ok(Message::Pong(_)) => {
                debug!("Received pong from client {}", username_for_handler);
                // クライアントが生きていることを確認
            }
            Ok(Message::Ping(_data)) => {
                debug!(
                    "Received ping from client {}, sending pong",
                    username_for_handler
                );
                // Pongを送信
                let _ = tx.send(WsMessage::Pong { timestamp: None });
            }
            Err(e) => {
                warn!("WebSocket error for user {}: {}", username_for_handler, e);
                break;
            }
        }
    }

    // クリーンアップ: 全ルームから退出
    info!(
        "Cleaning up WebSocket connection for user: {} ({})",
        username, user_id
    );
    cleanup_user_connections(user_id, &app_state).await;

    // タスクを停止
    send_task.abort();
    heartbeat_task.abort();

    info!(
        "WebSocket connection closed for user: {} ({})",
        username, user_id
    );
}

// WebSocketメッセージの処理
async fn handle_websocket_message(
    msg: WsMessage,
    user: &User,
    client: &ConnectedClient,
    pool: &PgPool,
    app_state: &AppState,
    sender: &broadcast::Sender<WsMessage>,
    meili_client: &meilisearch_sdk::client::Client,
) -> anyhow::Result<()> {
    match msg {
        WsMessage::JoinRoom { room } => {
            info!("User {} attempting to join room: {}", user.username, room);

            // ルーム名のバリデーション
            if room.is_empty() || room.len() > 100 {
                return Err(anyhow::anyhow!("Invalid room name"));
            }

            // ルームが存在するかチェック（IDまたは名前で検索）
            let room_obj = if let Ok(room_uuid) = room.parse::<Uuid>() {
                // UUIDの場合はIDで検索
                Room::find_by_id(pool, room_uuid).await?
            } else {
                // UUIDでない場合は名前で検索
                Room::find_by_name(pool, &room).await?
            }
            .ok_or_else(|| anyhow::anyhow!("Room not found"))?;

            // パブリックルームでない場合はメンバーシップをチェック
            if !room_obj.is_public && !room_obj.is_member(pool, user.id).await? {
                warn!(
                    "User {} attempted to join private room {} without permission",
                    user.username, room
                );
                return Err(anyhow::anyhow!("You are not a member of this private room"));
            }

            // アプリケーション状態にクライアントを追加
            add_client_to_room(&room, user.clone(), client.clone(), app_state).await;

            // 参加通知を送信
            sender.send(WsMessage::RoomJoined {
                room: room.clone(),
                user_id: user.id.to_string(),
                username: user.username.clone(),
            })?;

            // 他のクライアントに参加を通知
            broadcast_to_room(
                &room,
                WsMessage::UserJoined {
                    room: room.clone(),
                    user_id: user.id.to_string(),
                    username: user.username.clone(),
                },
                Some(user.id),
                app_state,
            )
            .await;

            info!("User {} successfully joined room: {}", user.username, room);
        }

        WsMessage::SendMessage {
            room,
            content,
            message_type,
        } => {
            // メッセージコンテンツのバリデーション
            if content.is_empty() {
                return Err(anyhow::anyhow!("Message content cannot be empty"));
            }
            if content.len() > 4000 {
                return Err(anyhow::anyhow!("Message content too long"));
            }

            // ルームが存在するかチェック（IDまたは名前で検索）
            let room_obj = if let Ok(room_uuid) = room.parse::<Uuid>() {
                // UUIDの場合はIDで検索
                Room::find_by_id(pool, room_uuid).await?
            } else {
                // UUIDでない場合は名前で検索
                Room::find_by_name(pool, &room).await?
            }
            .ok_or_else(|| anyhow::anyhow!("Room not found"))?;

            // パブリックルームでない場合はメンバーシップをチェック
            if !room_obj.is_public && !room_obj.is_member(pool, user.id).await? {
                return Err(anyhow::anyhow!("You are not a member of this private room"));
            }

            // メッセージタイプを変換
            let db_message_type = match message_type.as_deref() {
                Some("image") => DbMessageType::Image,
                Some("file") => DbMessageType::File,
                Some("system") => DbMessageType::System,
                _ => DbMessageType::Text,
            };

            // メッセージをDBに保存
            let message = DbMessage::create(
                pool,
                room_obj.id,
                user.id,
                content.clone(),
                db_message_type.clone(),
            )
            .await?;

            // Meilisearchにインデックス追加
            let index = meili_client.index("messages");
            let search_document = serde_json::json!({
                "id": message.id.to_string(),
                "room_id": room_obj.id.to_string(),
                "room_name": room_obj.name,
                "author_id": user.id.to_string(),
                "author_name": user.username,
                "content": content,
                "created_at": message.created_at.timestamp(),
                "message_type": match db_message_type {
                    DbMessageType::Text => "text",
                    DbMessageType::Image => "image",
                    DbMessageType::File => "file",
                    DbMessageType::System => "system",
                }
            });

            if let Err(e) = index.add_documents(&[search_document], Some("id")).await {
                tracing::error!("Failed to index message in Meilisearch: {}", e);
                // エラーをログに記録するが、メッセージ送信自体は成功とする
            }

            // 全クライアントにブロードキャスト
            let ws_message = WsMessage::Message {
                id: message.id.to_string(),
                room: room.clone(),
                user_id: user.id.to_string(),
                username: user.username.clone(),
                content,
                message_type: match db_message_type {
                    DbMessageType::Text => "text".to_string(),
                    DbMessageType::Image => "image".to_string(),
                    DbMessageType::File => "file".to_string(),
                    DbMessageType::System => "system".to_string(),
                },
                timestamp: message.created_at,
            };

            broadcast_to_room(&room, ws_message, None, app_state).await;
            debug!("Message sent by {} in room {}", user.username, room);
        }

        WsMessage::LeaveRoom { room } => {
            info!("User {} leaving room: {}", user.username, room);
            remove_client_from_room(&room, user.id, app_state).await;

            // 他のクライアントに退出を通知
            broadcast_to_room(
                &room,
                WsMessage::UserLeft {
                    room: room.clone(),
                    user_id: user.id.to_string(),
                    username: user.username.clone(),
                },
                Some(user.id),
                app_state,
            )
            .await;
        }

        WsMessage::Ping { timestamp } => {
            // Pongで応答
            sender.send(WsMessage::Pong { timestamp })?;
        }

        // WebRTC シグナリング処理
        WsMessage::WebRtcOffer {
            room,
            to_user_id,
            offer,
        } => {
            info!(
                "WebRTC offer from {} to {} in room {}",
                user.username, to_user_id, room
            );
            relay_webrtc_signal(
                WsMessage::WebRtcOffer {
                    room,
                    to_user_id,
                    offer,
                },
                user.id,
                app_state,
            )
            .await?;
        }

        WsMessage::WebRtcAnswer {
            room,
            to_user_id,
            answer,
        } => {
            info!(
                "WebRTC answer from {} to {} in room {}",
                user.username, to_user_id, room
            );
            relay_webrtc_signal(
                WsMessage::WebRtcAnswer {
                    room,
                    to_user_id,
                    answer,
                },
                user.id,
                app_state,
            )
            .await?;
        }

        WsMessage::WebRtcIceCandidate {
            room,
            to_user_id,
            candidate,
        } => {
            debug!(
                "WebRTC ICE candidate from {} to {} in room {}",
                user.username, to_user_id, room
            );
            relay_webrtc_signal(
                WsMessage::WebRtcIceCandidate {
                    room,
                    to_user_id,
                    candidate,
                },
                user.id,
                app_state,
            )
            .await?;
        }

        _ => {
            // 予期しないメッセージタイプ
            warn!("Unexpected message type from user {}", user.username);
        }
    }

    Ok(())
}

// JWT トークンを検証してユーザー情報を取得
async fn verify_jwt_token(token: &str, pool: &PgPool) -> anyhow::Result<User> {
    use crate::api::auth::Claims;
    use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};

    let secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "development_secret_key_change_in_production".to_string());

    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&["miuchi.chat"]);

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_ref()),
        &validation,
    )?;

    let user_id = token_data.claims.sub.parse::<Uuid>()?;
    let user = User::find_by_id(pool, user_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("User not found"))?;

    Ok(user)
}

// 接続数制限をチェック（最適化版）
async fn check_connection_limit(user_id: Uuid, app_state: &AppState) -> anyhow::Result<()> {
    let state = app_state.read().await;
    let mut connection_count = 0;

    // より効率的な検索: 全ルームを走査してユーザーの存在をチェック
    // 将来的にはユーザー別インデックスを実装予定
    for room_clients in state.values() {
        if room_clients.contains_key(&user_id) {
            connection_count += 1;
            // 早期終了: 制限を超えた時点で処理を停止
            if connection_count >= MAX_CONNECTIONS_PER_USER {
                return Err(anyhow::anyhow!("Maximum connections exceeded"));
            }
        }
    }

    Ok(())
}

// レート制限のリセットタスク
static RATE_LIMIT_RESET_TASK: std::sync::Once = std::sync::Once::new();

pub fn start_rate_limit_reset_task(app_state: AppState) {
    RATE_LIMIT_RESET_TASK.call_once(|| {
        tokio::spawn(async move {
            let mut interval = interval(RATE_LIMIT_WINDOW);
            loop {
                interval.tick().await;

                let state = app_state.read().await;
                for room_clients in state.values() {
                    for client in room_clients.values() {
                        // レート制限をリセット
                        while client.rate_limiter.available_permits() < RATE_LIMIT_MESSAGES {
                            client.rate_limiter.add_permits(1);
                        }
                    }
                }
            }
        });
    });
}

// クライアントをルームに追加
async fn add_client_to_room(room: &str, user: User, client: ConnectedClient, app_state: &AppState) {
    let mut state = app_state.write().await;
    let room_clients = state.entry(room.to_string()).or_insert_with(HashMap::new);

    let mut updated_client = client;
    updated_client.rooms.push(room.to_string());
    let room_count = updated_client.rooms.len();

    room_clients.insert(user.id, updated_client);

    info!(
        "Client {} added to room {}, total rooms: {}",
        user.username, room, room_count
    );
}

// クライアントをルームから削除
async fn remove_client_from_room(room: &str, user_id: Uuid, app_state: &AppState) {
    let mut state = app_state.write().await;
    if let Some(room_clients) = state.get_mut(room) {
        room_clients.remove(&user_id);
        if room_clients.is_empty() {
            state.remove(room);
        }
    }
}

// ユーザーの全接続をクリーンアップ
async fn cleanup_user_connections(user_id: Uuid, app_state: &AppState) {
    let mut state = app_state.write().await;
    let rooms_to_clean: Vec<String> = state.keys().cloned().collect();

    let mut cleaned_rooms = 0;
    for room in rooms_to_clean {
        if let Some(room_clients) = state.get_mut(&room) {
            if room_clients.remove(&user_id).is_some() {
                cleaned_rooms += 1;
                info!("Removed user {} from room {}", user_id, room);

                // ルームが空になったら削除
                if room_clients.is_empty() {
                    state.remove(&room);
                    info!("Removed empty room: {}", room);
                }
            }
        }
    }

    info!(
        "Cleaned up {} room connections for user {}",
        cleaned_rooms, user_id
    );
}

// ルーム内の全クライアントにメッセージをブロードキャスト
async fn broadcast_to_room(
    room: &str,
    message: WsMessage,
    exclude_user: Option<Uuid>,
    app_state: &AppState,
) {
    let state = app_state.read().await;
    if let Some(room_clients) = state.get(room) {
        let mut success_count = 0;
        let mut error_count = 0;

        for (user_id, client) in room_clients {
            if exclude_user.map_or(true, |exclude| exclude != *user_id) {
                match client.sender.send(message.clone()) {
                    Ok(_) => success_count += 1,
                    Err(_) => {
                        error_count += 1;
                        warn!(
                            "Failed to send message to user {} in room {}",
                            user_id, room
                        );
                    }
                }
            }
        }

        debug!(
            "Broadcast to room {}: {} successful, {} failed",
            room, success_count, error_count
        );
    } else {
        warn!("Attempted to broadcast to non-existent room: {}", room);
    }
}

// オンラインユーザー情報を取得
pub async fn get_online_users_info(
    app_state: &AppState,
) -> Vec<(uuid::Uuid, String, Vec<String>, std::time::Instant)> {
    let state = app_state.read().await;
    let mut users_map: std::collections::HashMap<
        uuid::Uuid,
        (String, Vec<String>, std::time::Instant),
    > = std::collections::HashMap::new();

    // 各ルームのクライアントを走査
    for (room_name, room_clients) in state.iter() {
        for (user_id, client) in room_clients.iter() {
            if let Some((username, rooms, connected_at)) = users_map.get_mut(user_id) {
                // 既存ユーザーにルームを追加
                rooms.push(room_name.clone());
            } else {
                // 新しいユーザーを追加
                users_map.insert(
                    *user_id,
                    (
                        client.username.clone(),
                        vec![room_name.clone()],
                        client.connected_at,
                    ),
                );
            }
        }
    }

    // Vec形式で返す
    users_map
        .into_iter()
        .map(|(user_id, (username, rooms, connected_at))| (user_id, username, rooms, connected_at))
        .collect()
}

// WebRTCシグナリングメッセージを特定のユーザーに中継
async fn relay_webrtc_signal(
    message: WsMessage,
    from_user_id: Uuid,
    app_state: &AppState,
) -> anyhow::Result<()> {
    let target_user_id = match &message {
        WsMessage::WebRtcOffer { to_user_id, .. }
        | WsMessage::WebRtcAnswer { to_user_id, .. }
        | WsMessage::WebRtcIceCandidate { to_user_id, .. } => to_user_id
            .parse::<Uuid>()
            .map_err(|_| anyhow::anyhow!("Invalid target user ID"))?,
        _ => return Err(anyhow::anyhow!("Invalid WebRTC message type")),
    };

    let state = app_state.read().await;
    let mut message_sent = false;

    // 対象ユーザーが現在接続している全ルームを検索
    for room_clients in state.values() {
        if let Some(target_client) = room_clients.get(&target_user_id) {
            // メッセージに送信者の情報を追加
            let enriched_message = match message.clone() {
                WsMessage::WebRtcOffer { room, offer, .. } => WsMessage::WebRtcOffer {
                    room,
                    to_user_id: from_user_id.to_string(),
                    offer,
                },
                WsMessage::WebRtcAnswer { room, answer, .. } => WsMessage::WebRtcAnswer {
                    room,
                    to_user_id: from_user_id.to_string(),
                    answer,
                },
                WsMessage::WebRtcIceCandidate {
                    room, candidate, ..
                } => WsMessage::WebRtcIceCandidate {
                    room,
                    to_user_id: from_user_id.to_string(),
                    candidate,
                },
                _ => message.clone(),
            };

            match target_client.sender.send(enriched_message) {
                Ok(_) => {
                    debug!("WebRTC signal relayed to user {}", target_user_id);
                    message_sent = true;
                    break; // 1つの接続に送信したら終了
                }
                Err(e) => {
                    warn!(
                        "Failed to send WebRTC signal to user {}: {}",
                        target_user_id, e
                    );
                }
            }
        }
    }

    if !message_sent {
        warn!("Target user {} not found for WebRTC signal", target_user_id);
        return Err(anyhow::anyhow!("Target user not found or offline"));
    }

    Ok(())
}
