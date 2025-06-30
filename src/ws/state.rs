use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;
use uuid::Uuid;

use super::types::ConnectedClient;

// 全体の状態管理
pub type AppState = Arc<RwLock<HashMap<String, HashMap<Uuid, ConnectedClient>>>>;

// ユーザーベースの接続管理を追加
pub type UserConnections = Arc<RwLock<HashMap<Uuid, usize>>>;

// オンラインユーザー情報を取得
pub async fn get_online_users_info(app_state: &AppState) -> Vec<(uuid::Uuid, String, Vec<String>, std::time::Instant)> {
    let state = app_state.read().await;
    let mut users_map: std::collections::HashMap<uuid::Uuid, (String, Vec<String>, std::time::Instant)> = std::collections::HashMap::new();
    
    // 各ルームのクライアントを走査
    for (room_name, room_clients) in state.iter() {
        for (user_id, client) in room_clients.iter() {
            if let Some((username, rooms, connected_at)) = users_map.get_mut(user_id) {
                // 既存ユーザーにルームを追加
                rooms.push(room_name.clone());
            } else {
                // 新しいユーザーを追加
                users_map.insert(*user_id, (
                    client.username.clone(),
                    vec![room_name.clone()],
                    client.connected_at
                ));
            }
        }
    }
    
    // Vec形式で返す
    users_map.into_iter()
        .map(|(user_id, (username, rooms, connected_at))| (user_id, username, rooms, connected_at))
        .collect()
}

// クライアントをルームに追加
pub async fn add_client_to_room(room: &str, user: crate::models::User, client: ConnectedClient, app_state: &AppState) {
    let mut state = app_state.write().await;
    let room_clients = state.entry(room.to_string()).or_insert_with(HashMap::new);

    let mut updated_client = client;
    updated_client.rooms.push(room.to_string());
    let room_count = updated_client.rooms.len();

    room_clients.insert(user.id, updated_client);

    tracing::info!(
        "Client {} added to room {}, total rooms: {}",
        user.username, room, room_count
    );
}

// クライアントをルームから削除
pub async fn remove_client_from_room(room: &str, user_id: Uuid, app_state: &AppState) {
    let mut state = app_state.write().await;
    if let Some(room_clients) = state.get_mut(room) {
        room_clients.remove(&user_id);
        if room_clients.is_empty() {
            state.remove(room);
        }
    }
}

// ユーザーの全接続をクリーンアップ
pub async fn cleanup_user_connections(user_id: Uuid, app_state: &AppState) {
    let mut state = app_state.write().await;
    let rooms_to_clean: Vec<String> = state.keys().cloned().collect();

    let mut cleaned_rooms = 0;
    for room in rooms_to_clean {
        if let Some(room_clients) = state.get_mut(&room) {
            if room_clients.remove(&user_id).is_some() {
                cleaned_rooms += 1;
                tracing::info!("Removed user {} from room {}", user_id, room);

                // ルームが空になったら削除
                if room_clients.is_empty() {
                    state.remove(&room);
                    tracing::info!("Removed empty room: {}", room);
                }
            }
        }
    }

    tracing::info!(
        "Cleaned up {} room connections for user {}",
        cleaned_rooms, user_id
    );
}

// ルーム内の全クライアントにメッセージをブロードキャスト
pub async fn broadcast_to_room(
    room: &str,
    message: super::types::WsMessage,
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
                        tracing::warn!(
                            "Failed to send message to user {} in room {}",
                            user_id, room
                        );
                    }
                }
            }
        }

        tracing::debug!(
            "Broadcast to room {}: {} successful, {} failed",
            room, success_count, error_count
        );
    } else {
        tracing::warn!("Attempted to broadcast to non-existent room: {}", room);
    }
}