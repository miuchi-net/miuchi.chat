# ルームシステム仕様

## 概要

miuchi.chatではパブリック/プライベートのルームシステムを採用しています。

## ルームタイプ

### パブリックルーム
- **アクセス権限**: 認証された全ユーザーがアクセス可能
- **メンバーシップ**: メンバー管理不要、誰でも参加・退出可能
- **デフォルトルーム**: `general`, `random`が常時利用可能

### プライベートルーム
- **アクセス権限**: 招待されたメンバーのみアクセス可能
- **メンバーシップ**: `room_members`テーブルで管理
- **招待機能**: 既存メンバーが新しいユーザーを招待可能

## データベース設計

### roomsテーブル
```sql
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    is_public BOOLEAN NOT NULL DEFAULT false, -- パブリック/プライベートフラグ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### room_membersテーブル（プライベートルーム用）
```sql
CREATE TABLE room_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(room_id, user_id)
);
```

## アクセス制御ロジック

### WebSocketルーム参加
```rust
// パブリックルームでない場合のみメンバーシップをチェック
if !room_obj.is_public && !room_obj.is_member(pool, user.id).await? {
    return Err(anyhow::anyhow!("You are not a member of this private room"));
}
```

### メッセージ送信
- パブリックルーム: 認証されたユーザーなら誰でも送信可能
- プライベートルーム: メンバーのみ送信可能

## デフォルト動作

### 初期状態
1. アプリケーション起動時は`general`ルームに自動接続
2. ルーム一覧には`general`, `random`が常に表示される
3. パブリックルームはメンバーシップ不要でアクセス可能

### ルーム一覧表示
- パブリックルーム: 常時表示
- プライベートルーム: メンバーの場合のみ表示

## UI/UX仕様

### パブリックルーム
- ルーム名の前に`#`アイコン
- 誰でも参加可能である旨を表示

### プライベートルーム  
- ルーム名の前に🔒アイコン
- メンバー確認モーダル
- 招待ボタン（メンバーの場合）
- 現在のメンバー一覧

## API エンドポイント（予定）

```
GET /api/rooms                    # 参加可能なルーム一覧
POST /api/rooms                   # ルーム作成
GET /api/rooms/{id}/members       # ルームメンバー一覧
POST /api/rooms/{id}/invite       # メンバー招待
DELETE /api/rooms/{id}/members/{user_id}  # メンバー削除
```

## WebSocket メッセージ

### 参加・退出
```json
// ルーム参加
{"type": "join_room", "room": "room_id_or_name"}

// ルーム退出  
{"type": "leave_room", "room": "room_id_or_name"}
```

### 権限エラー
```json
{"type": "error", "message": "You are not a member of this private room"}
```