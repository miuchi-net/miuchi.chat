use sqlx::PgPool;
use std::sync::Arc;
use testcontainers::{clients::Cli, images::postgres::Postgres, Container};

pub struct TestContext {
    pub pool: PgPool,
    pub _container: Container<'static, Postgres>,
}

impl TestContext {
    pub async fn new() -> Self {
        let docker = Cli::default();
        let container = docker.run(Postgres::default());
        let port = container.get_host_port_ipv4(5432);
        
        let database_url = format!(
            "postgresql://postgres:postgres@localhost:{}/postgres",
            port
        );
        
        let pool = PgPool::connect(&database_url).await.unwrap();
        
        // マイグレーション実行
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        
        Self {
            pool,
            _container: container,
        }
    }
    
    /// テスト用のユーザーを作成
    pub async fn create_test_user(&self, github_id: i64, username: &str) -> uuid::Uuid {
        sqlx::query!(
            "INSERT INTO users (github_id, username) VALUES ($1, $2) RETURNING id",
            github_id,
            username
        )
        .fetch_one(&self.pool)
        .await
        .unwrap()
        .id
    }
    
    /// テスト用のルームを作成
    pub async fn create_test_room(&self, name: &str, is_public: bool, created_by: uuid::Uuid) -> uuid::Uuid {
        sqlx::query!(
            "INSERT INTO rooms (name, is_public, created_by) VALUES ($1, $2, $3) RETURNING id",
            name,
            is_public,
            created_by
        )
        .fetch_one(&self.pool)
        .await
        .unwrap()
        .id
    }
    
    /// テスト用のメッセージを作成
    pub async fn create_test_message(
        &self, 
        room_id: uuid::Uuid, 
        user_id: uuid::Uuid, 
        content: &str
    ) -> uuid::Uuid {
        sqlx::query!(
            "INSERT INTO messages (room_id, user_id, content) VALUES ($1, $2, $3) RETURNING id",
            room_id,
            user_id,
            content
        )
        .fetch_one(&self.pool)
        .await
        .unwrap()
        .id
    }
}

/// テスト用JWT生成
pub fn create_test_jwt(user_id: &str) -> String {
    use jsonwebtoken::{encode, EncodingKey, Header};
    use serde::{Serialize, Deserialize};
    use chrono::{Utc, Duration};

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