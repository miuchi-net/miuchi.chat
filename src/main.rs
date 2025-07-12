use axum::{
    extract::State,
    response::{Html, Json},
    routing::get,
    Router,
};
use serde_json::{json, Value};
use sqlx::PgPool;
use std::{collections::HashMap, net::SocketAddr, sync::Arc};
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use utoipa::OpenApi;

mod api;
mod error;
mod models;
mod ws;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "miuchi.chat API",
        version = "0.1.0",
        description = "A Rust-based chat and voice call application API",
        contact(
            name = "miuchi.chat",
            email = "contact@miuchi.chat"
        )
    ),
    paths(
        api::auth::login_url,
        api::auth::callback,
        api::auth::dev_login,
        api::auth::me,
        api::chat::get_messages,
        api::chat::send_message,
        api::chat::create_room,
        api::chat::get_rooms,
        api::chat::get_room_members,
        api::chat::invite_user,
        api::chat::get_online_users,
        api::search::search_messages,
    ),
    components(
        schemas(
            api::auth::LoginUrlResponse,
            api::auth::CallbackQuery,
            api::auth::TokenResponse,
            api::auth::UserResponse,
            api::chat::Message,
            api::chat::MessageType,
            api::chat::SendMessageRequest,
            api::chat::SendMessageResponse,
            api::chat::MessagesResponse,
            api::chat::CreateRoomRequest,
            api::chat::CreateRoomResponse,
            api::chat::RoomInfo,
            api::chat::RoomsResponse,
            api::chat::RoomMember,
            api::chat::RoomMembersResponse,
            api::chat::InviteUserRequest,
            api::chat::InviteUserResponse,
            api::chat::OnlineUser,
            api::chat::OnlineUsersResponse,
            api::search::SearchResult,
            api::search::SearchResponse,
        )
    ),
    tags(
        (name = "Authentication", description = "User authentication and authorization"),
        (name = "Chat", description = "Chat messaging functionality"),
        (name = "Search", description = "Message search functionality")
    ),
    security(
        ("bearer_auth" = ["bearer"])
    )
)]
struct ApiDoc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 環境変数を読み込み
    dotenvy::dotenv().ok();

    // ロギング設定
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "miuchi_chat=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // データベース接続プールを作成
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://postgres:password@postgres:5432/miuchi_chat".to_string());
    
    tracing::info!("Connecting to database: {}", database_url);
    let pool = PgPool::connect(&database_url).await?;
    
    // データベース接続テスト
    let version: (String,) = sqlx::query_as("SELECT version()")
        .fetch_one(&pool)
        .await?;
    tracing::info!("Database connected: {}", version.0);

    // Meilisearchクライアントを初期化
    let meilisearch_url = std::env::var("MEILI_URL")
        .unwrap_or_else(|_| "http://meilisearch:7700".to_string());
    let meilisearch_key = std::env::var("MEILI_MASTER_KEY").ok();
    
    let meili_client = if let Some(key) = meilisearch_key {
        meilisearch_sdk::client::Client::new(meilisearch_url, Some(key))?
    } else {
        meilisearch_sdk::client::Client::new(meilisearch_url, None::<String>)?
    };
    tracing::info!("Meilisearch client initialized");

    // WebSocket用の状態管理を初期化
    let ws_state: ws::AppState = Arc::new(RwLock::new(HashMap::new()));
    
    // レート制限リセットタスクを開始
    ws::start_rate_limit_reset_task(ws_state.clone());

    // ルーターを構築
    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health_check))
        .route("/db-health", get(db_health_check))
        .route("/api-docs/openapi.json", get(openapi_json))
        .route("/swagger-ui", get(swagger_ui))
        .nest("/api", api::create_router().with_state((pool.clone(), meili_client.clone())))
        .merge(api::create_chat_router())
        .route("/ws", get(ws::websocket_handler))
        .with_state((pool, ws_state, meili_client))
        .layer(CorsLayer::permissive());

    // サーバーを起動
    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    tracing::info!("listening on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn root() -> Json<Value> {
    Json(json!({
        "message": "miuchi.chat API",
        "version": "0.1.0"
    }))
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now()
    }))
}

async fn db_health_check(State((pool, _, _)): State<(PgPool, ws::AppState, meilisearch_sdk::client::Client)>) -> Json<Value> {
    match sqlx::query("SELECT 1").execute(&pool).await {
        Ok(_) => Json(json!({
            "status": "healthy",
            "database": "connected",
            "timestamp": chrono::Utc::now()
        })),
        Err(e) => Json(json!({
            "status": "unhealthy",
            "database": "disconnected",
            "error": e.to_string(),
            "timestamp": chrono::Utc::now()
        }))
    }
}

async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}

async fn swagger_ui() -> Html<&'static str> {
    Html(r#"
<!DOCTYPE html>
<html>
<head>
    <title>miuchi.chat API Documentation</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.0.0/swagger-ui.css" />
    <style>
        html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin:0; background: #fafafa; }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.0.0/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.0.0/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            const ui = SwaggerUIBundle({
                url: '/api-docs/openapi.json',
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout"
            });
        };
    </script>
</body>
</html>
"#)
}
