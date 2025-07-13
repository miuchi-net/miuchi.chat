use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, Type};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[sqlx(type_name = "message_type", rename_all = "lowercase")]
pub enum DbMessageType {
    Text,
    Image,
    File,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Message {
    pub id: Uuid,
    pub room_id: Uuid,
    pub user_id: Uuid,
    pub content: String,
    pub message_type: DbMessageType,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MessageWithUser {
    pub id: Uuid,
    pub room_id: Uuid,
    pub user_id: Uuid,
    pub username: String,
    pub avatar_url: Option<String>,
    pub content: String,
    pub message_type: DbMessageType,
    pub created_at: DateTime<Utc>,
}

impl Message {
    pub async fn create(
        pool: &PgPool,
        room_id: Uuid,
        user_id: Uuid,
        content: String,
        message_type: DbMessageType,
    ) -> anyhow::Result<Message> {
        let message = sqlx::query_as::<_, Message>(
            r#"
            INSERT INTO messages (room_id, user_id, content, message_type)
            VALUES ($1, $2, $3, $4)
            RETURNING id, room_id, user_id, content, message_type, created_at, updated_at
            "#,
        )
        .bind(room_id)
        .bind(user_id)
        .bind(content)
        .bind(message_type)
        .fetch_one(pool)
        .await?;

        Ok(message)
    }

    pub async fn find_by_room_with_users(
        pool: &PgPool,
        room_id: Uuid,
        limit: i64,
        before_id: Option<Uuid>,
    ) -> anyhow::Result<Vec<MessageWithUser>> {
        let sql = if before_id.is_some() {
            r#"
            SELECT 
                m.id,
                m.room_id,
                m.user_id,
                u.username,
                u.avatar_url,
                m.content,
                m.message_type,
                m.created_at
            FROM messages m
            JOIN users u ON m.user_id = u.id
            WHERE m.room_id = $1 AND m.id < $2
            ORDER BY m.created_at DESC
            LIMIT $3
            "#
        } else {
            r#"
            SELECT 
                m.id,
                m.room_id,
                m.user_id,
                u.username,
                u.avatar_url,
                m.content,
                m.message_type,
                m.created_at
            FROM messages m
            JOIN users u ON m.user_id = u.id
            WHERE m.room_id = $1
            ORDER BY m.created_at DESC
            LIMIT $2
            "#
        };

        let mut query = sqlx::query_as::<_, MessageWithUser>(sql).bind(room_id);

        if let Some(before_id) = before_id {
            query = query.bind(before_id);
        }

        let messages = query.bind(limit).fetch_all(pool).await?;

        Ok(messages)
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> anyhow::Result<Option<Message>> {
        let message = sqlx::query_as::<_, Message>(
            "SELECT id, room_id, user_id, content, message_type, created_at, updated_at 
             FROM messages WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        Ok(message)
    }
}
