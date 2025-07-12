mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use serde_json::json;
use tower::ServiceExt;

use common::TestContext;

/// テスト用のアプリケーション作成
async fn create_test_app(pool: sqlx::PgPool) -> Router {
    use miuchi_chat::api;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::RwLock;
    
    // ダミーのMeilisearchクライアント（テスト用）
    let meili_client = meilisearch_sdk::client::Client::new("http://localhost:7700", None::<String>).unwrap();
    let ws_state = Arc::new(RwLock::new(HashMap::new()));
    
    Router::new()
        .nest("/api", api::create_router().with_state((pool.clone(), meili_client.clone())))
        .merge(api::create_chat_router())
        .with_state((pool, ws_state, meili_client))
}

#[tokio::test]
async fn test_health_endpoint() {
    let ctx = TestContext::new().await;
    let app = create_test_app(ctx.pool.clone()).await;
    
    let response = app
        .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    
    assert_eq!(json["status"], "healthy");
    assert!(json["timestamp"].is_string());
}

#[tokio::test]
async fn test_get_rooms_unauthorized() {
    let ctx = TestContext::new().await;
    let app = create_test_app(ctx.pool.clone()).await;
    
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/chat/rooms")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_get_rooms_authorized() {
    let ctx = TestContext::new().await;
    let app = create_test_app(ctx.pool.clone()).await;
    
    // テストユーザー作成
    let user_id = ctx.create_test_user(12345, "testuser").await;
    let token = common::create_test_jwt(&user_id.to_string());
    
    // テストルーム作成
    ctx.create_test_room("general", true, user_id).await;
    ctx.create_test_room("private", false, user_id).await;
    
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/chat/rooms")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    
    assert!(json["rooms"].is_array());
    let rooms = json["rooms"].as_array().unwrap();
    assert!(rooms.len() >= 2);
    
    // パブリックルームの確認
    let general_room = rooms.iter().find(|r| r["name"] == "general").unwrap();
    assert_eq!(general_room["is_public"], true);
    
    // プライベートルームの確認
    let private_room = rooms.iter().find(|r| r["name"] == "private").unwrap();
    assert_eq!(private_room["is_public"], false);
}

#[tokio::test]
async fn test_get_messages() {
    let ctx = TestContext::new().await;
    let app = create_test_app(ctx.pool.clone()).await;
    
    // テストデータ準備
    let user_id = ctx.create_test_user(12345, "testuser").await;
    let room_id = ctx.create_test_room("testroom", true, user_id).await;
    let token = common::create_test_jwt(&user_id.to_string());
    
    // テストメッセージ作成
    ctx.create_test_message(room_id, user_id, "Hello world!").await;
    ctx.create_test_message(room_id, user_id, "Second message").await;
    
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/chat/testroom/messages")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    
    assert!(json["messages"].is_array());
    let messages = json["messages"].as_array().unwrap();
    assert_eq!(messages.len(), 2);
    
    // メッセージ内容確認
    assert!(messages.iter().any(|m| m["content"] == "Hello world!"));
    assert!(messages.iter().any(|m| m["content"] == "Second message"));
}

#[tokio::test]
async fn test_send_message() {
    let ctx = TestContext::new().await;
    let app = create_test_app(ctx.pool.clone()).await;
    
    // テストデータ準備
    let user_id = ctx.create_test_user(12345, "testuser").await;
    let _room_id = ctx.create_test_room("testroom", true, user_id).await;
    let token = common::create_test_jwt(&user_id.to_string());
    
    let request_body = json!({
        "content": "New test message",
        "message_type": "text"
    });
    
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/chat/testroom/send")
                .method("POST")
                .header("Authorization", format!("Bearer {}", token))
                .header("Content-Type", "application/json")
                .body(Body::from(request_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    
    assert!(json["message_id"].is_string());
    assert!(json["timestamp"].is_string());
}

#[tokio::test]
async fn test_create_room() {
    let ctx = TestContext::new().await;
    let app = create_test_app(ctx.pool.clone()).await;
    
    let user_id = ctx.create_test_user(12345, "testuser").await;
    let token = common::create_test_jwt(&user_id.to_string());
    
    let request_body = json!({
        "name": "newroom",
        "description": "A new test room",
        "is_public": false
    });
    
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/chat/rooms")
                .method("POST")
                .header("Authorization", format!("Bearer {}", token))
                .header("Content-Type", "application/json")
                .body(Body::from(request_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    
    assert_eq!(json["name"], "newroom");
    assert_eq!(json["description"], "A new test room");
    assert_eq!(json["is_public"], false);
    assert!(json["id"].is_string());
}

#[tokio::test]
async fn test_room_not_found() {
    let ctx = TestContext::new().await;
    let app = create_test_app(ctx.pool.clone()).await;
    
    let user_id = ctx.create_test_user(12345, "testuser").await;
    let token = common::create_test_jwt(&user_id.to_string());
    
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/chat/nonexistent/messages")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_pagination() {
    let ctx = TestContext::new().await;
    let app = create_test_app(ctx.pool.clone()).await;
    
    let user_id = ctx.create_test_user(12345, "testuser").await;
    let room_id = ctx.create_test_room("testroom", true, user_id).await;
    let token = common::create_test_jwt(&user_id.to_string());
    
    // 大量のメッセージ作成
    for i in 0..55 {
        ctx.create_test_message(room_id, user_id, &format!("Message {}", i)).await;
    }
    
    // 制限付きで取得
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/chat/testroom/messages?limit=10")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    
    let messages = json["messages"].as_array().unwrap();
    assert_eq!(messages.len(), 10);
    assert_eq!(json["has_more"], true);
    assert!(json["next_cursor"].is_string());
}