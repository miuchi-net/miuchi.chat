# 招待システム仕様

## 概要

miuchi.chatのプライベートルームでは、既存メンバーが新しいユーザーを招待する機能を提供しています。

## 基本仕様

### 招待可能な条件
- **プライベートルームのみ**: パブリックルームには招待機能はありません
- **メンバーのみ**: そのプライベートルームのメンバーのみが他のユーザーを招待可能
- **既存ユーザー**: システムに登録済みのユーザーのみ招待可能（ユーザー名で検索）

### 招待の制限
- 既にメンバーのユーザーは招待できません
- 存在しないユーザー名は招待できません
- プライベートルームの非メンバーは招待権限がありません

## データベース設計

### 関連テーブル

#### usersテーブル
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

#### room_membersテーブル（招待結果を管理）
```sql
CREATE TABLE room_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(room_id, user_id)
);
```

## API仕様

### 招待エンドポイント

```http
POST /api/chat/{room}/invite
```

**リクエスト**:
```json
{
  "username": "招待するユーザー名"
}
```

**レスポンス**:
```json
{
  "success": true,
  "message": "usernameをルームに招待しました"
}
```

**エラーレスポンス**:
```json
{
  "success": false,
  "message": "エラーメッセージ"
}
```

### HTTPステータスコード

| コード | 意味 | 詳細 |
|--------|------|------|
| 200 | 成功 | 招待完了または既にメンバー |
| 400 | 不正なリクエスト | ユーザーIDの形式不正など |
| 403 | アクセス拒否 | 招待権限がない |
| 404 | 見つからない | ルームまたはユーザーが存在しない |

## UI/UX仕様

### メンバー一覧モーダル

#### パブリックルーム
- 「パブリックチャンネルではメンバー管理は行われません」を表示
- 招待ボタンは表示されない

#### プライベートルーム
- メンバー一覧を表示（ユーザー名 + 参加日時）
- 下部に「メンバーを招待」ボタンを表示

### 招待フォーム

#### 初期状態
- 「メンバーを招待」ボタンのみ表示

#### 招待フォーム展開
- ユーザー名入力フィールド
- 「招待」ボタンと「キャンセル」ボタン
- リアルタイムエラー表示

#### 招待処理中
- 「招待中...」表示
- ボタンを無効化

#### 成功・エラー表示
- 成功: 緑色のメッセージバー
- エラー: 赤色のメッセージバー
- 自動的にメンバー一覧を再読み込み

## フロントエンド実装

### コンポーネント構成

```typescript
// MemberList.tsx
interface MemberListProps {
  room: Room | null
  isVisible: boolean
  onClose: () => void
}

// 招待関連のstate
const [showInviteForm, setShowInviteForm] = useState(false)
const [inviteUsername, setInviteUsername] = useState('')
const [inviteError, setInviteError] = useState<string | null>(null)
const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
const [isInviting, setIsInviting] = useState(false)
```

### API呼び出し

```typescript
// services/api.ts
inviteUser: async (room: string, username: string) => {
    const response = await apiClient.post(`/chat/${room}/invite`, {
        username
    })
    return response.data
}
```

## バックエンド実装

### ビジネスロジック

1. **認証チェック**: JWTトークンでユーザー認証
2. **ルーム検索**: ルーム名からルームオブジェクトを取得
3. **権限チェック**: 
   - パブリックルームは招待不可
   - 現在のユーザーがメンバーかチェック
4. **対象ユーザー検索**: ユーザー名からユーザーを検索
5. **重複チェック**: 既にメンバーかどうかチェック
6. **メンバー追加**: `room_members`テーブルに追加

### エラーハンドリング

```rust
// パブリックルームのチェック
if room.is_public {
    return Ok(Json(InviteUserResponse {
        success: false,
        message: "パブリックルームには招待は必要ありません".to_string(),
    }));
}

// 権限チェック
if !is_member {
    return Err(axum::http::StatusCode::FORBIDDEN);
}

// 重複チェック
if is_already_member {
    return Ok(Json(InviteUserResponse {
        success: false,
        message: format!("{}は既にメンバーです", payload.username),
    }));
}
```

## セキュリティ考慮事項

### 認証・認可
- JWTトークンによる認証必須
- プライベートルームのメンバーのみ招待権限
- ルーム存在チェックとアクセス権限チェック

### データ検証
- ユーザー名の存在確認
- 重複メンバーシップの防止
- SQLインジェクション対策（sqlxのパラメータバインディング使用）

### レート制限
- WebSocketと同じレート制限機能を適用可能
- 大量招待の防止

## 将来の拡張

### 招待リンク機能
- 期限付き招待リンクの生成
- ワンタイム招待トークン

### 招待通知
- WebSocket経由での招待通知
- メール通知機能

### 招待履歴
- 誰が誰を招待したかの履歴管理
- 招待ログの保存

### 招待承認制
- 招待を受ける側の承認フロー
- 招待の拒否機能

## テスト方法

### 手動テスト手順

1. **プライベートルーム作成**: 新しいプライベートルームを作成
2. **メンバー確認**: メンバーボタンで自分が表示されることを確認
3. **招待テスト**: 既存ユーザー名（例: `abap34`）を招待
4. **エラーテスト**: 存在しないユーザー名を招待してエラー確認
5. **重複テスト**: 同じユーザーを再度招待して重複エラー確認

### APIテスト例

```bash
# 認証トークン取得
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/dev-login | jq -r '.access_token')

# ユーザー招待
curl -X POST http://localhost:3001/api/chat/test-private/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "abap34"}'
```

## 既知の制限事項

- 現在はユーザー名による招待のみサポート
- 招待通知機能は未実装
- 招待権限の細かい制御（管理者のみ等）は未実装
- 一度に複数ユーザーの招待は未サポート