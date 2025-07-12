# miuchi.chat API仕様書

## 概要

miuchi.chatは、Rust + React で構築されたリアルタイムチャット・通話アプリケーションです。  
このドキュメントでは、バックエンドAPIの詳細仕様を記述します。

## バージョン情報

| 項目 | 値 |
|------|---|
| APIバージョン | v1 |
| OpenAPI | 3.0 |
| ベースURL | `https://api.miuchi.chat` (本番) / `http://localhost:3001` (開発) |
| 認証方式 | JWT Bearer Token |

## 認証

### 認証フロー

#### 1. GitHub OAuth認証
```http
GET /api/auth/login-url
```

**レスポンス:**
```json
{
  "login_url": "https://github.com/login/oauth/authorize?client_id=...",
  "state": "random_state_string"
}
```

#### 2. コールバック処理
```http
GET /api/auth/callback?code=AUTH_CODE&state=STATE
```

**レスポンス:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 86400
}
```

#### 3. 開発用認証 (DEV_MODE=true時のみ)
```http
POST /api/auth/dev-login
```

**レスポンス:**
```json
{
  "access_token": "dev_token",
  "token_type": "Bearer",
  "expires_in": 86400
}
```

### 認証ヘッダー

全ての保護されたエンドポイントには以下のヘッダーが必要：

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

## エンドポイント一覧

### 🔐 認証 (Authentication)

| メソッド | エンドポイント | 説明 | 認証 |
|----------|----------------|------|------|
| GET | `/api/auth/login-url` | GitHub OAuth URL取得 | 不要 |
| GET | `/api/auth/callback` | OAuth コールバック | 不要 |
| POST | `/api/auth/dev-login` | 開発用ログイン | 不要 |
| GET | `/api/auth/me` | 現在のユーザー情報 | 必要 |

### 💬 チャット (Chat)

| メソッド | エンドポイント | 説明 | 認証 |
|----------|----------------|------|------|
| GET | `/api/chat` | 利用可能ルーム一覧 | 必要 |
| POST | `/api/chat` | 新規ルーム作成 | 必要 |
| GET | `/api/chat/{room}/messages` | メッセージ履歴取得 | 必要 |
| POST | `/api/chat/{room}/send` | メッセージ送信 | 必要 |
| GET | `/api/chat/{room}/members` | ルームメンバー一覧 | 必要 |
| POST | `/api/chat/{room}/invite` | ユーザー招待 | 必要 |
| GET | `/api/online-users` | オンラインユーザー一覧 | 必要 |

### 🔍 検索 (Search)

| メソッド | エンドポイント | 説明 | 認証 |
|----------|----------------|------|------|
| GET | `/api/search` | メッセージ全文検索 | 必要 |

### 📊 システム (System)

| メソッド | エンドポイント | 説明 | 認証 |
|----------|----------------|------|------|
| GET | `/` | API ルート情報 | 不要 |
| GET | `/health` | ヘルスチェック | 不要 |
| GET | `/db-health` | DB ヘルスチェック | 不要 |
| GET | `/api-docs/openapi.json` | OpenAPI仕様 | 不要 |
| GET | `/swagger-ui` | Swagger UI | 不要 |

## 詳細仕様

### 認証 API

#### GET /api/auth/me
現在のユーザー情報を取得

**レスポンス例:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "username": "octocat",
  "email": "octocat@github.com",
  "avatar_url": "https://github.com/images/error/octocat_happy.gif",
  "display_name": "The Octocat"
}
```

### チャット API

#### GET /api/chat
利用可能なルーム一覧を取得

**レスポンス例:**
```json
{
  "rooms": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174001",
      "name": "general",
      "description": "一般的な雑談用ルーム",
      "is_public": true,
      "created_at": "2023-01-01T00:00:00Z"
    },
    {
      "id": "123e4567-e89b-12d3-a456-426614174002",
      "name": "project-alpha",
      "description": "プロジェクトアルファ専用",
      "is_public": false,
      "created_at": "2023-01-02T00:00:00Z"
    }
  ]
}
```

#### POST /api/chat
新規ルームを作成

**リクエスト:**
```json
{
  "name": "my-new-room",
  "description": "新しいプライベートルーム",
  "is_public": false
}
```

**レスポンス:**
```json
{
  "room": {
    "id": "123e4567-e89b-12d3-a456-426614174003",
    "name": "my-new-room",
    "description": "新しいプライベートルーム",
    "is_public": false,
    "created_at": "2023-01-03T00:00:00Z"
  }
}
```

#### GET /api/chat/{room}/messages
指定ルームのメッセージ履歴を取得

**クエリパラメーター:**
- `limit` (optional): 取得件数 (デフォルト: 50, 最大: 100)
- `before` (optional): 指定ID以前のメッセージを取得 (ページネーション用)

**レスポンス例:**
```json
{
  "messages": [
    {
      "id": "msg_123e4567",
      "author_id": "123e4567-e89b-12d3-a456-426614174000",
      "author_name": "octocat",
      "author_avatar": "https://github.com/images/error/octocat_happy.gif",
      "content": "Hello, world!",
      "message_type": "text",
      "created_at": "2023-01-01T12:00:00Z"
    }
  ],
  "total": 1,
  "has_more": false
}
```

#### POST /api/chat/{room}/send
指定ルームにメッセージを送信

**リクエスト:**
```json
{
  "content": "Hello, everyone!",
  "message_type": "text"
}
```

**レスポンス:**
```json
{
  "id": "msg_789e0123",
  "timestamp": "2023-01-01T12:01:00Z"
}
```

#### GET /api/chat/{room}/members
ルームメンバー一覧を取得

**レスポンス例:**
```json
{
  "members": [
    {
      "user_id": "123e4567-e89b-12d3-a456-426614174000",
      "username": "octocat",
      "joined_at": "2023-01-01T00:00:00Z"
    }
  ]
}
```

#### POST /api/chat/{room}/invite
ユーザーをルームに招待

**リクエスト:**
```json
{
  "username": "new_user"
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "new_userをルームに招待しました"
}
```

#### GET /api/online-users
現在オンラインのユーザー一覧を取得

**レスポンス例:**
```json
{
  "users": [
    {
      "user_id": "123e4567-e89b-12d3-a456-426614174000",
      "username": "octocat",
      "connected_rooms": ["general", "project-alpha"],
      "connected_at": "2023-01-01T12:00:00Z"
    }
  ],
  "total_count": 1
}
```

### 検索 API

#### GET /api/search
メッセージの全文検索

**クエリパラメーター:**
- `q` (required): 検索クエリ
- `room` (optional): ルーム名でフィルター
- `author` (optional): 著者名でフィルター
- `limit` (optional): 結果数制限 (デフォルト: 20, 最大: 100)
- `offset` (optional): オフセット (ページネーション用)

**レスポンス例:**
```json
{
  "results": [
    {
      "message": {
        "id": "msg_123e4567",
        "room_id": "general",
        "author_id": "123e4567-e89b-12d3-a456-426614174000",
        "author_name": "octocat",
        "content": "Hello, world! This is a test message.",
        "message_type": "text",
        "created_at": "2023-01-01T12:00:00Z"
      },
      "highlights": ["<mark>Hello</mark>", "<mark>world</mark>"],
      "score": 0.98
    }
  ],
  "total_hits": 1,
  "query_time_ms": 5,
  "has_more": false
}
```

## WebSocket API

### 接続

```
ws://localhost:3001/ws?token=YOUR_JWT_TOKEN
```

### メッセージ形式

#### クライアント → サーバー

**ルーム参加:**
```json
{
  "type": "join_room",
  "room": "general"
}
```

**メッセージ送信:**
```json
{
  "type": "send_message",
  "room": "general",
  "content": "Hello!",
  "message_type": "text"
}
```

**ルーム退出:**
```json
{
  "type": "leave_room",
  "room": "general"
}
```

**Ping:**
```json
{
  "type": "ping",
  "timestamp": 1672531200000
}
```

#### サーバー → クライアント

**ルーム参加成功:**
```json
{
  "type": "room_joined",
  "room": "general",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "username": "octocat"
}
```

**新着メッセージ:**
```json
{
  "type": "message",
  "id": "msg_123e4567",
  "room": "general",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "username": "octocat",
  "content": "Hello!",
  "message_type": "text",
  "timestamp": "2023-01-01T12:00:00Z"
}
```

**ユーザー参加/退出:**
```json
{
  "type": "user_joined",
  "room": "general",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "username": "octocat"
}
```

**エラー:**
```json
{
  "type": "error",
  "message": "Room not found",
  "code": 4004
}
```

**Pong:**
```json
{
  "type": "pong",
  "timestamp": 1672531200000
}
```

### WebRTCシグナリング

**Offer送信:**
```json
{
  "type": "webrtc_offer",
  "room": "general",
  "to_user_id": "target_user_id",
  "offer": {
    "type": "offer",
    "sdp": "v=0\r\no=..."
  }
}
```

**Answer送信:**
```json
{
  "type": "webrtc_answer",
  "room": "general",
  "to_user_id": "caller_user_id", 
  "answer": {
    "type": "answer",
    "sdp": "v=0\r\no=..."
  }
}
```

**ICE Candidate送信:**
```json
{
  "type": "webrtc_ice_candidate",
  "room": "general",
  "to_user_id": "peer_user_id",
  "candidate": {
    "candidate": "candidate:...",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```

## エラーハンドリング

### HTTPステータスコード

| コード | 意味 | 説明 |
|--------|------|------|
| 200 | OK | 正常レスポンス |
| 400 | Bad Request | 不正なリクエスト |
| 401 | Unauthorized | 認証が必要 |
| 403 | Forbidden | アクセス権限なし |
| 404 | Not Found | リソースが見つからない |
| 429 | Too Many Requests | レート制限に抵触 |
| 500 | Internal Server Error | サーバー内部エラー |

### WebSocketクローズコード

| コード | 意味 | 説明 |
|--------|------|------|
| 4001 | Authentication Failed | JWT認証失敗 |
| 4002 | Rate Limited | レート制限に抵触 |
| 4003 | Access Denied | アクセス権限なし |
| 4004 | Not Found | ルーム/リソースが見つからない |

### エラーレスポンス形式

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "必須パラメーターが不足しています",
    "details": {
      "missing_fields": ["username"]
    }
  }
}
```

## レート制限

### WebSocket
- **メッセージ送信**: 10回/分
- **ルーム参加/退出**: 20回/分
- **リセット間隔**: 1分

### HTTP API
- **一般API**: 100回/分
- **検索API**: 30回/分

## セキュリティ

### JWT仕様
- **アルゴリズム**: HS256
- **有効期限**: 24時間
- **クレーム**:
  - `sub`: ユーザーID (UUID)
  - `aud`: "miuchi.chat"
  - `exp`: 有効期限
  - `iat`: 発行時刻

### CORS設定
開発環境では全オリジン許可、本番では以下のみ許可：
- `https://miuchi.chat`
- `https://app.miuchi.chat`

## 実装例

### JavaScript (fetch)

```javascript
// 認証ヘッダー付きリクエスト
const response = await fetch('/api/chat/general/messages', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
```

### WebSocketクライアント

```javascript
const ws = new WebSocket(`ws://localhost:3001/ws?token=${token}`);

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'join_room',
    room: 'general'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```

## バージョン履歴

| バージョン | 日付 | 変更内容 |
|------------|------|----------|
| v1.0 | 2025-01-12 | 初回リリース |

---

**注意**: この仕様書は開発中のバージョンに基づいており、実際の実装と異なる場合があります。最新情報は OpenAPI 仕様 (`/api-docs/openapi.json`) を参照してください。