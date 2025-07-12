# miuchi.chat リファクタリング計画

## 概要

現在のコードベース分析に基づいて、品質向上、保守性向上、パフォーマンス改善を目的としたリファクタリング計画を策定します。

## 現状の課題分析

### 🔴 高優先度課題

1. **テストカバレッジ不足**
   - **問題**: 統合テストスイートが存在しない
   - **影響**: 機能追加時の回帰リスク、リファクタリング時の信頼性低下
   - **優先度**: 高

2. **型定義の重複**
   - **問題**: フロントエンド・バックエンドで同じ型定義が重複
   - **影響**: 変更時の同期漏れ、保守コスト増大
   - **優先度**: 高

3. **エラーハンドリングの不一致**
   - **問題**: APIエラーレスポンス形式が一部不統一
   - **影響**: フロントエンドでの予測困難なエラー処理
   - **優先度**: 中

### 🟡 中優先度課題

4. **大きなファイルの分割**
   - **問題**: `ws.rs`が748行と大きい（ミス8で分割済み）
   - **影響**: 可読性低下、テスト困難
   - **優先度**: 中（一部改善済み）

5. **パフォーマンス最適化機会**
   - **問題**: メッセージ取得の非効率なクエリ
   - **影響**: 大量データ時のレスポンス低下
   - **優先度**: 中

6. **設定管理の分散**
   - **問題**: 設定値がファイル間に散在
   - **影響**: 設定変更時の影響範囲把握困難
   - **優先度**: 低

## リファクタリング戦略

### Phase 1: 基盤整備（週1）

#### 1.1 テストインフラ構築
```
目標: 基本的なテストフレームワークを構築
期間: 2-3日
```

**Rust バックエンド:**
- `cargo test` 環境構築
- データベースマイグレーション用テストDB設定
- WebSocket接続テスト基盤

**React フロントエンド:**
- Jest + Testing Library 環境構築
- WebSocket モックライブラリ導入
- コンポーネントテスト環境

#### 1.2 型定義共有化
```
目標: フロント・バックエンド間の型定義統一
期間: 1-2日
```

**実装方針:**
1. OpenAPI仕様から TypeScript 型自動生成
2. 共通型定義ファイルの作成
3. 型チェック自動化

### Phase 2: コード品質向上（週2）

#### 2.1 エラーハンドリング統一
```
目標: 一貫したエラーレスポンス形式
期間: 1-2日
```

**実装内容:**
- 統一エラーレスポンス形式定義
- カスタムエラー型の整備
- フロントエンドエラーハンドリング改善

#### 2.2 設定管理統一
```
目標: 設定値の一元管理
期間: 1日
```

**実装内容:**
- `config.rs` による設定一元化
- 環境別設定ファイル整備
- 設定検証機能追加

### Phase 3: パフォーマンス最適化（週3）

#### 3.1 データベースクエリ最適化
```
目標: クエリパフォーマンス改善
期間: 2-3日
```

**最適化対象:**
- メッセージ履歴取得クエリ
- ルームメンバー確認クエリ
- 検索クエリ（Meilisearch統合改善）

#### 3.2 フロントエンド最適化
```
目標: レンダリングパフォーマンス改善
期間: 1-2日
```

**最適化内容:**
- メッセージリスト仮想化
- コンポーネントメモ化
- バンドルサイズ最適化

## 具体的実装計画

### 1. テストインフラ構築

#### 1.1 Rust テスト環境

```toml
# Cargo.toml - テスト依存関係追加
[dev-dependencies]
tokio-test = "0.4"
testcontainers = "0.15"
mockall = "0.11"
wiremock = "0.5"
```

```rust
// tests/common/mod.rs - テスト共通モジュール
use sqlx::PgPool;
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
}
```

#### 1.2 React テスト環境

```json
// package.json - テスト依存関係追加
{
  "devDependencies": {
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0",
    "jest": "^29.0.0",
    "jest-environment-jsdom": "^29.0.0",
    "msw": "^2.0.0"
  }
}
```

```typescript
// src/__tests__/setup.ts - テスト設定
import '@testing-library/jest-dom';
import { server } from './mocks/server';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### 2. 型定義共有化

#### 2.1 OpenAPI型生成設定

```json
// package.json - 型生成スクリプト
{
  "scripts": {
    "generate-types": "openapi-typescript http://localhost:3001/api-docs/openapi.json -o src/types/api.ts"
  }
}
```

```typescript
// src/types/shared.ts - 共通型定義
// OpenAPI仕様から自動生成される型を re-export
export type { 
  components,
  paths,
  operations 
} from './api';

// 共通型定義
export type ApiResponse<T> = {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  has_more: boolean;
  limit: number;
  offset: number;
};
```

### 3. エラーハンドリング統一

#### 3.1 Rust エラー統一

```rust
// src/error.rs - 統一エラー型
use axum::{http::StatusCode, response::IntoResponse, Json};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error")]
    Database(#[from] sqlx::Error),
    
    #[error("Authentication failed: {message}")]
    Authentication { message: String },
    
    #[error("Authorization failed: {message}")]
    Authorization { message: String },
    
    #[error("Not found: {resource}")]
    NotFound { resource: String },
    
    #[error("Bad request: {message}")]
    BadRequest { message: String },
    
    #[error("Rate limit exceeded")]
    RateLimit,
    
    #[error("Internal server error")]
    Internal(#[from] anyhow::Error),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Database(_) => "DATABASE_ERROR",
            Self::Authentication { .. } => "AUTHENTICATION_ERROR",
            Self::Authorization { .. } => "AUTHORIZATION_ERROR",
            Self::NotFound { .. } => "NOT_FOUND",
            Self::BadRequest { .. } => "BAD_REQUEST",
            Self::RateLimit => "RATE_LIMIT_EXCEEDED",
            Self::Internal(_) => "INTERNAL_ERROR",
        }
    }
    
    pub fn status_code(&self) -> StatusCode {
        match self {
            Self::Database(_) | Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            Self::Authentication { .. } => StatusCode::UNAUTHORIZED,
            Self::Authorization { .. } => StatusCode::FORBIDDEN,
            Self::NotFound { .. } => StatusCode::NOT_FOUND,
            Self::BadRequest { .. } => StatusCode::BAD_REQUEST,
            Self::RateLimit => StatusCode::TOO_MANY_REQUESTS,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let body = json!({
            "error": {
                "code": self.code(),
                "message": self.to_string(),
                "timestamp": chrono::Utc::now()
            }
        });

        (self.status_code(), Json(body)).into_response()
    }
}
```

#### 3.2 フロントエンド エラー処理

```typescript
// src/services/errorHandler.ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromResponse(response: Response, data: any): ApiError {
    return new ApiError(
      response.status,
      data.error?.code || 'UNKNOWN_ERROR',
      data.error?.message || response.statusText,
      data.error?.details
    );
  }
}

export const handleApiError = (error: ApiError) => {
  switch (error.code) {
    case 'AUTHENTICATION_ERROR':
      // トークン削除・ログイン画面へリダイレクト
      localStorage.removeItem('token');
      window.location.href = '/login';
      break;
      
    case 'RATE_LIMIT_EXCEEDED':
      // レート制限通知
      showNotification('送信回数が制限を超えました。しばらくお待ちください。', 'warning');
      break;
      
    case 'NOT_FOUND':
      // 404エラー処理
      showNotification('要求されたリソースが見つかりません。', 'error');
      break;
      
    default:
      // 汎用エラー処理
      showNotification(error.message || '予期しないエラーが発生しました。', 'error');
  }
};
```

### 4. パフォーマンス最適化

#### 4.1 データベースクエリ最適化

```rust
// src/models/message.rs - 最適化されたクエリ
impl Message {
    pub async fn get_room_messages_paginated(
        pool: &PgPool,
        room_id: &Uuid,
        limit: i64,
        cursor: Option<&DateTime<Utc>>
    ) -> Result<(Vec<Self>, bool), sqlx::Error> {
        let messages = if let Some(before) = cursor {
            sqlx::query_as!(
                Message,
                r#"
                SELECT 
                    m.id,
                    m.room_id,
                    m.user_id,
                    m.content,
                    m.message_type as "message_type: DbMessageType",
                    m.created_at,
                    m.updated_at,
                    u.username as author_name,
                    u.avatar_url as author_avatar
                FROM messages m
                JOIN users u ON m.user_id = u.id
                WHERE m.room_id = $1 AND m.created_at < $2
                ORDER BY m.created_at DESC
                LIMIT $3
                "#,
                room_id,
                before,
                limit + 1  // 次ページ有無確認用
            )
        } else {
            sqlx::query_as!(
                Message,
                r#"
                SELECT 
                    m.id,
                    m.room_id,
                    m.user_id,
                    m.content,
                    m.message_type as "message_type: DbMessageType",
                    m.created_at,
                    m.updated_at,
                    u.username as author_name,
                    u.avatar_url as author_avatar
                FROM messages m
                JOIN users u ON m.user_id = u.id
                WHERE m.room_id = $1
                ORDER BY m.created_at DESC
                LIMIT $2
                "#,
                room_id,
                limit + 1
            )
        }
        .fetch_all(pool)
        .await?;

        let has_more = messages.len() > limit as usize;
        let mut result = messages;
        if has_more {
            result.pop(); // 余分な1件を削除
        }

        Ok((result, has_more))
    }
}
```

#### 4.2 フロントエンド最適化

```typescript
// src/components/chat/VirtualizedMessageList.tsx
import { FixedSizeList as List } from 'react-window';

interface VirtualizedMessageListProps {
  messages: Message[];
  height: number;
  onLoadMore: () => void;
}

export const VirtualizedMessageList = React.memo(({ 
  messages, 
  height, 
  onLoadMore 
}: VirtualizedMessageListProps) => {
  const Row = React.memo(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const message = messages[index];
    
    // 最初の5件表示時に追加読み込み
    if (index < 5) {
      onLoadMore();
    }
    
    return (
      <div style={style}>
        <MessageItem message={message} />
      </div>
    );
  });

  return (
    <List
      height={height}
      itemCount={messages.length}
      itemSize={80}
      width="100%"
      overscanCount={5}
    >
      {Row}
    </List>
  );
});
```

## 実施タイムライン

### Week 1: 基盤整備
- [ ] **Day 1-2**: Rust テスト環境構築
- [ ] **Day 3-4**: React テスト環境構築
- [ ] **Day 5**: 型定義共有化実装

### Week 2: 品質向上
- [ ] **Day 1-2**: エラーハンドリング統一
- [ ] **Day 3**: 設定管理統一
- [ ] **Day 4-5**: 基本テストケース作成

### Week 3: 最適化
- [ ] **Day 1-2**: データベースクエリ最適化
- [ ] **Day 3-4**: フロントエンド最適化
- [ ] **Day 5**: パフォーマンステスト実施

## 成功指標

### 品質指標
- [ ] **テストカバレッジ**: 70%以上
- [ ] **型安全性**: TypeScript strict mode エラーゼロ
- [ ] **Linting**: Clippy警告ゼロ、ESLint警告ゼロ

### パフォーマンス指標
- [ ] **API応答時間**: メッセージ取得 < 200ms
- [ ] **WebSocket遅延**: メッセージ配信 < 100ms
- [ ] **フロントエンド**: First Contentful Paint < 1.5s

### 保守性指標
- [ ] **ファイルサイズ**: 最大500行以下
- [ ] **循環複雑度**: 関数あたり10以下
- [ ] **重複コード**: DRY原則遵守

## リスク管理

### 高リスク
1. **データベース移行失敗**
   - **対策**: マイグレーションテスト、ロールバック計画
   - **検証**: テスト環境での完全検証

2. **WebSocket接続断**
   - **対策**: 段階的リファクタリング、接続テスト充実
   - **検証**: 負荷テストでの検証

### 中リスク
3. **型定義不整合**
   - **対策**: CI/CDでの型チェック自動化
   - **検証**: プルリクエスト時の自動検証

4. **パフォーマンス劣化**
   - **対策**: ベンチマーク測定、段階的最適化
   - **検証**: 本番環境での監視

## 実行手順

### 準備フェーズ
1. 現在のコードベースのバックアップ
2. ブランチ戦略決定（feature/refactoring-*）
3. CI/CD パイプライン準備

### 実行フェーズ
1. 各フェーズごとにプルリクエスト作成
2. レビュー・テスト・マージのサイクル
3. 本番環境での段階的デプロイ

### 検証フェーズ
1. パフォーマンステスト実施
2. ユーザビリティテスト
3. 運用監視による効果測定

---

**作成日**: 2025-01-12  
**責任者**: miuchi.chat開発チーム  
**レビュー予定**: 週次進捗確認