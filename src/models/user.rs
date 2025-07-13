use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub github_id: i64,
    pub username: String,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl User {
    pub async fn find_by_github_id(pool: &PgPool, github_id: i64) -> anyhow::Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            "SELECT id, github_id, username, email, avatar_url, created_at, updated_at 
             FROM users WHERE github_id = $1",
        )
        .bind(github_id)
        .fetch_optional(pool)
        .await?;

        Ok(user)
    }

    pub async fn create_or_update_from_github(
        pool: &PgPool,
        github_id: i64,
        username: String,
        email: Option<String>,
        avatar_url: Option<String>,
    ) -> anyhow::Result<User> {
        let user = sqlx::query_as::<_, User>(
            r#"
            INSERT INTO users (github_id, username, email, avatar_url)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (github_id) 
            DO UPDATE SET 
                username = EXCLUDED.username,
                email = EXCLUDED.email,
                avatar_url = EXCLUDED.avatar_url,
                updated_at = now()
            RETURNING id, github_id, username, email, avatar_url, created_at, updated_at
            "#,
        )
        .bind(github_id)
        .bind(username)
        .bind(email)
        .bind(avatar_url)
        .fetch_one(pool)
        .await?;

        Ok(user)
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> anyhow::Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            "SELECT id, github_id, username, email, avatar_url, created_at, updated_at 
             FROM users WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        Ok(user)
    }

    pub async fn find_by_username(pool: &PgPool, username: &str) -> anyhow::Result<Option<User>> {
        let user = sqlx::query_as::<_, User>(
            "SELECT id, github_id, username, email, avatar_url, created_at, updated_at 
             FROM users WHERE username = $1",
        )
        .bind(username)
        .fetch_optional(pool)
        .await?;

        Ok(user)
    }
}
