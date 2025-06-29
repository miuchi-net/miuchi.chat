use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Room {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RoomMember {
    pub id: Uuid,
    pub room_id: Uuid,
    pub user_id: Uuid,
    pub joined_at: DateTime<Utc>,
}

impl Room {
    pub async fn find_by_name(pool: &PgPool, name: &str) -> anyhow::Result<Option<Room>> {
        let room = sqlx::query_as::<_, Room>(
            "SELECT id, name, description, created_by, created_at, updated_at 
             FROM rooms WHERE name = $1"
        )
        .bind(name)
        .fetch_optional(pool)
        .await?;
        
        Ok(room)
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> anyhow::Result<Option<Room>> {
        let room = sqlx::query_as::<_, Room>(
            "SELECT id, name, description, created_by, created_at, updated_at 
             FROM rooms WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;
        
        Ok(room)
    }

    pub async fn create(
        pool: &PgPool,
        name: String,
        description: Option<String>,
        created_by: Uuid,
    ) -> anyhow::Result<Room> {
        let room = sqlx::query_as::<_, Room>(
            r#"
            INSERT INTO rooms (name, description, created_by)
            VALUES ($1, $2, $3)
            RETURNING id, name, description, created_by, created_at, updated_at
            "#
        )
        .bind(name)
        .bind(description)
        .bind(created_by)
        .fetch_one(pool)
        .await?;

        Ok(room)
    }

    pub async fn is_member(&self, pool: &PgPool, user_id: Uuid) -> anyhow::Result<bool> {
        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2)"
        )
        .bind(self.id)
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        Ok(exists)
    }

    pub async fn add_member(&self, pool: &PgPool, user_id: Uuid) -> anyhow::Result<RoomMember> {
        let member = sqlx::query_as::<_, RoomMember>(
            r#"
            INSERT INTO room_members (room_id, user_id)
            VALUES ($1, $2)
            ON CONFLICT (room_id, user_id) DO NOTHING
            RETURNING id, room_id, user_id, joined_at
            "#
        )
        .bind(self.id)
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        Ok(member)
    }
}