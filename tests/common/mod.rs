use axum::Router;
use meilisearch_sdk::client::Client as MeilisearchClient;
use sqlx::PgPool;

pub struct TestContext {
    pub pool: Option<PgPool>,
    pub meili_client: MeilisearchClient,
}

impl TestContext {
    pub async fn new() -> Self {
        // 環境変数からデータベース接続を取得（存在する場合）
        let pool = if let Ok(database_url) = std::env::var("DATABASE_URL") {
            match PgPool::connect(&database_url).await {
                Ok(pool) => {
                    // マイグレーション実行を試行
                    let _ = sqlx::migrate!("./migrations").run(&pool).await;
                    Some(pool)
                }
                Err(_) => None,
            }
        } else {
            None
        };

        // Meilisearch クライアント初期化
        let meili_url = std::env::var("MEILI_URL").unwrap_or_else(|_| "http://localhost:7700".to_string());
        let meili_key = std::env::var("MEILI_MASTER_KEY").ok();
        let meili_client = if let Some(key) = meili_key {
            MeilisearchClient::new(meili_url, Some(key)).unwrap_or_else(|_| {
                // Fallback to no-key client
                MeilisearchClient::new("http://localhost:7700", None::<String>).unwrap()
            })
        } else {
            MeilisearchClient::new(meili_url, None::<String>).unwrap()
        };

        Self {
            pool,
            meili_client,
        }
    }

    pub async fn create_app(&self) -> Router {
        // テスト用の接続プールを使用（利用可能な場合）または最小限のダミー接続
        let pool = if let Some(ref pool) = self.pool {
            pool.clone()
        } else {
            // CI/CD環境やローカルでサービスが利用できない場合の代替接続
            // 実際のデータベース操作は行わず、アプリケーション構造のテストのみ
            let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
                "postgresql://postgres:password@localhost:5432/test_db".to_string()
            });
            
            // タイムアウト付きで接続を試行
            let connect_future = PgPool::connect(&database_url);
            match tokio::time::timeout(std::time::Duration::from_secs(2), connect_future).await {
                Ok(Ok(pool)) => pool,
                Ok(Err(_)) | Err(_) => {
                    // 接続できない場合、テスト用の空接続（実際にはconnectしない）
                    eprintln!("Warning: Database connection failed, creating test-only app");
                    
                    // 最小限のテスト用ダミー接続で代替
                    // この場合、実際のDBが必要なテストは失敗するが、基本的なルーティングは動作する
                    let dummy_url = "postgresql://test:test@127.0.0.1:0/testdb";
                    let pool_options = sqlx::postgres::PgPoolOptions::new()
                        .max_connections(1)
                        .acquire_timeout(std::time::Duration::from_millis(100))
                        .idle_timeout(std::time::Duration::from_millis(100));
                    
                    // 実際には接続しないダミープール
                    pool_options.connect(dummy_url).await
                        .unwrap_or_else(|_| {
                            panic!("Cannot run tests without database connection. Please start PostgreSQL or set DATABASE_URL environment variable.")
                        })
                }
            }
        };

        miuchi_chat::create_app(pool, self.meili_client.clone()).await
    }

    /// テスト用のユーザーを作成
    pub async fn create_test_user(&self, github_id: i64, username: &str) -> uuid::Uuid {
        if let Some(ref pool) = self.pool {
            let result: (uuid::Uuid,) = sqlx::query_as(
                "INSERT INTO users (github_id, username) VALUES ($1, $2) RETURNING id"
            )
            .bind(github_id)
            .bind(username)
            .fetch_one(pool)
            .await
            .unwrap();
            result.0
        } else {
            // ダミーのUUIDを返す
            uuid::Uuid::new_v4()
        }
    }

    /// テスト用のルームを作成
    pub async fn create_test_room(
        &self,
        name: &str,
        is_public: bool,
        created_by: uuid::Uuid,
    ) -> uuid::Uuid {
        if let Some(ref pool) = self.pool {
            let result: (uuid::Uuid,) = sqlx::query_as(
                "INSERT INTO rooms (name, is_public, created_by) VALUES ($1, $2, $3) RETURNING id"
            )
            .bind(name)
            .bind(is_public)
            .bind(created_by)
            .fetch_one(pool)
            .await
            .unwrap();
            result.0
        } else {
            // ダミーのUUIDを返す
            uuid::Uuid::new_v4()
        }
    }

    /// テスト用のメッセージを作成
    pub async fn create_test_message(
        &self,
        room_id: uuid::Uuid,
        user_id: uuid::Uuid,
        content: &str,
    ) -> uuid::Uuid {
        if let Some(ref pool) = self.pool {
            let result: (uuid::Uuid,) = sqlx::query_as(
                "INSERT INTO messages (room_id, user_id, content) VALUES ($1, $2, $3) RETURNING id"
            )
            .bind(room_id)
            .bind(user_id)
            .bind(content)
            .fetch_one(pool)
            .await
            .unwrap();
            result.0
        } else {
            // ダミーのUUIDを返す
            uuid::Uuid::new_v4()
        }
    }
}

/// テスト用JWT生成
pub fn create_test_jwt(user_id: &str) -> String {
    use chrono::{Duration, Utc};
    use jsonwebtoken::{encode, EncodingKey, Header};
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize)]
    struct Claims {
        sub: String,
        username: String,
        exp: usize,
        aud: String,
    }

    let claims = Claims {
        sub: user_id.to_string(),
        username: "test_user".to_string(),
        exp: (Utc::now() + Duration::hours(24)).timestamp() as usize,
        aud: "miuchi.chat".to_string(),
    };

    let secret = "test_secret";
    let key = EncodingKey::from_secret(secret.as_bytes());

    encode(&Header::default(), &claims, &key).unwrap()
}
