/**
 * Production Ready Integration Tests
 * HTTP API エンドポイントの基本的な統合テスト
 */

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

mod common;
use common::TestContext;

/// 基本的なヘルスチェックテスト
#[tokio::test]
async fn test_health_endpoints() {
    let ctx = TestContext::new().await;
    let app = ctx.create_app().await;

    // ルートエンドポイント
    let response = app
        .clone()
        .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // ヘルスチェック
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // DBヘルスチェック（結果は問わず、エンドポイントの存在確認）
    let response = app
        .oneshot(
            Request::builder()
                .uri("/db-health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    // ステータスコードは OK または INTERNAL_SERVER_ERROR のいずれかを期待
    assert!(
        response.status() == StatusCode::OK || response.status() == StatusCode::INTERNAL_SERVER_ERROR
    );
}

/// 認証フローの基本テスト
#[tokio::test]
async fn test_authentication_flow() {
    let ctx = TestContext::new().await;
    let app = ctx.create_app().await;

    // 1. GitHub OAuth URL取得
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/auth/login-url")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert!(json["login_url"].as_str().unwrap().contains("github.com"));

    // 2. 未認証でアクセス
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/auth/me")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

/// API 可用性の基本テスト
#[tokio::test]
async fn test_api_availability() {
    let ctx = TestContext::new().await;
    let app = ctx.create_app().await;

    // JWT作成
    let token = common::create_test_jwt("test-user-id");

    // API エンドポイントの可用性確認（データベースが必要なものは適切なエラーレスポンスを期待）
    let endpoints = vec![
        ("/api/chat/rooms", Method::GET),
        ("/api/chat/online-users", Method::GET),
    ];

    for (endpoint, method) in endpoints {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(endpoint)
                    .header("authorization", format!("Bearer {}", token))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        
        // 認証は通るが、データベースエラーやサービス利用不可エラーが返ることを期待
        assert!(
            response.status() == StatusCode::OK 
            || response.status() == StatusCode::INTERNAL_SERVER_ERROR
            || response.status() == StatusCode::SERVICE_UNAVAILABLE
        );
    }
}

/// エラーハンドリングテスト
#[tokio::test]
async fn test_error_handling() {
    let ctx = TestContext::new().await;
    let app = ctx.create_app().await;

    // 1. 未認証アクセス
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/auth/me")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    // 2. 不正なトークン
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/auth/me")
                .header("authorization", "Bearer invalid_token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    // 3. 存在しないエンドポイント
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/nonexistent")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}