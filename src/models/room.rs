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
    pub is_public: bool,
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

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RoomMemberWithUser {
    pub user_id: Uuid,
    pub username: String,
    pub joined_at: DateTime<Utc>,
}

impl Room {
    pub async fn find_by_name(pool: &PgPool, name: &str) -> anyhow::Result<Option<Room>> {
        let room = sqlx::query_as::<_, Room>(
            "SELECT id, name, description, created_by, is_public, created_at, updated_at 
             FROM rooms WHERE name = $1"
        )
        .bind(name)
        .fetch_optional(pool)
        .await?;
        
        Ok(room)
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> anyhow::Result<Option<Room>> {
        let room = sqlx::query_as::<_, Room>(
            "SELECT id, name, description, created_by, is_public, created_at, updated_at 
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
        is_public: bool,
    ) -> anyhow::Result<Room> {
        let room = sqlx::query_as::<_, Room>(
            r#"
            INSERT INTO rooms (name, description, created_by, is_public)
            VALUES ($1, $2, $3, $4)
            RETURNING id, name, description, created_by, is_public, created_at, updated_at
            "#
        )
        .bind(name)
        .bind(description)
        .bind(created_by)
        .bind(is_public)
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

    pub async fn get_members(&self, pool: &PgPool) -> anyhow::Result<Vec<RoomMemberWithUser>> {
        let members = sqlx::query_as::<_, RoomMemberWithUser>(
            r#"
            SELECT rm.user_id, u.username, rm.joined_at
            FROM room_members rm
            JOIN users u ON rm.user_id = u.id
            WHERE rm.room_id = $1
            ORDER BY rm.joined_at ASC
            "#
        )
        .bind(self.id)
        .fetch_all(pool)
        .await?;

        Ok(members)
    }

    // ユーザーがアクセス可能なルーム一覧を取得（パブリック + メンバーのプライベート）
    pub async fn get_accessible_rooms(pool: &PgPool, user_id: Uuid) -> anyhow::Result<Vec<Room>> {
        let rooms = sqlx::query_as::<_, Room>(
            r#"
            SELECT DISTINCT r.id, r.name, r.description, r.created_by, r.is_public, r.created_at, r.updated_at
            FROM rooms r
            LEFT JOIN room_members rm ON r.id = rm.room_id AND rm.user_id = $1
            WHERE r.is_public = true OR rm.user_id IS NOT NULL
            ORDER BY r.created_at ASC
            "#
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(rooms)
    }
}