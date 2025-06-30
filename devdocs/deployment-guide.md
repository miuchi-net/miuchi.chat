# miuchi.chat デプロイメントガイド

## 概要

miuchi.chatは、Rust + React + PostgreSQL + Meilisearchで構成されるリアルタイムチャット・通話アプリケーションです。このガイドでは、本番環境へのデプロイに関する全体構成と詳細手順を説明します。

## アーキテクチャ概要

```mermaid
graph TB
    subgraph "External Services"
        GitHub[GitHub OAuth]
        DNS[DNS Provider]
        SSL[Let's Encrypt]
    end
    
    subgraph "Frontend"
        Nginx[Nginx / CDN]
        React[React PWA]
    end
    
    subgraph "Backend Services"
        API[Rust API Server]
        WS[WebSocket Server]
    end
    
    subgraph "Data Layer"
        PostgreSQL[(PostgreSQL)]
        Meilisearch[(Meilisearch)]
    end
    
    Users --> Nginx
    Nginx --> React
    React --> API
    React --> WS
    API --> PostgreSQL
    API --> Meilisearch
    API --> GitHub
    Nginx --> SSL
    DNS --> Nginx
```

## デプロイ構成比較

### 1. 推奨構成: Docker + クラウドVPS ⭐

**🏗️ 提案サービス:**
- **VPS**: DigitalOcean Droplets, Vultr High Frequency, Linode, Hetzner Cloud
- **ドメイン**: Cloudflare Registrar, Namecheap
- **CDN**: Cloudflare (無料プラン)
- **監視**: UptimeRobot (無料), Better Uptime
- **バックアップ**: DigitalOcean Volumes, rsync + cron

**💰 コスト**: 月$30-80

**メリット:**
- 環境の一貫性が保証される
- 開発環境との互換性が高い
- スケーリングが容易
- コスト効率が良い

**デメリット:**
- Dockerの知識が必要
- 初期設定が複雑

**適用ケース:**
- 初回デプロイ
- 中小規模運用（〜1000ユーザー）
- 開発チームでの運用

### 2. フルマネージド構成

**🏗️ 提案サービス:**
- **フロントエンド**: Vercel, Netlify, Cloudflare Pages
- **バックエンド**: Railway, Render, Fly.io
- **データベース**: PlanetScale, Neon, Supabase
- **検索**: Algolia, Elasticsearch Service
- **ファイル**: Cloudflare R2, AWS S3

**💰 コスト**: 月$100-300

**メリット:**
- 設定が簡単（Git連携でのデプロイ）
- 自動スケーリング
- 運用負荷が軽い
- 高可用性

**デメリット:**
- コストが高い
- ベンダーロックイン
- 細かい制御が困難

**適用ケース:**
- 迅速なローンチ
- 技術リソースが限定的
- スタートアップ

### 3. クラウドネイティブ構成

**🏗️ 提案サービス:**
- **コンテナ**: AWS ECS, Google Cloud Run, Azure Container Apps
- **データベース**: AWS RDS, Google Cloud SQL, Azure Database
- **検索**: AWS OpenSearch, Google Cloud Search
- **ロードバランサー**: AWS ALB, Google Cloud Load Balancer
- **CDN**: AWS CloudFront, Google Cloud CDN

**💰 コスト**: 月$200-800

**メリット:**
- エンタープライズ級の可用性
- 自動スケーリング・復旧
- 豊富な付加サービス
- セキュリティ機能充実

**デメリット:**
- 高コスト
- 複雑な設定
- ベンダーロックイン

**適用ケース:**
- 大規模運用（1000+ユーザー）
- エンタープライズ環境
- 高可用性が必要

### 4. ハイブリッド構成（コスト最適化）

**🏗️ 提案サービス:**
- **バックエンド**: Hetzner VPS（安価）
- **フロントエンド**: Cloudflare Pages（無料）
- **データベース**: Railway PostgreSQL（$5/月〜）
- **検索**: 自己ホスト Meilisearch
- **CDN**: Cloudflare（無料）

**💰 コスト**: 月$20-50

**メリット:**
- 最低コスト
- 柔軟な構成
- パフォーマンス良好

**デメリット:**
- 複雑な設定
- 複数サービス管理
- 一部手動運用

**適用ケース:**
- 予算重視
- 技術的知識がある
- 段階的スケール

## 推奨デプロイ構成詳細

### 必要なリソース要件

**最小要件:**
- CPU: 2vCPU
- メモリ: 4GB RAM
- ストレージ: 20GB SSD
- ネットワーク: 100Mbps

**推奨要件:**
- CPU: 4vCPU
- メモリ: 8GB RAM
- ストレージ: 50GB SSD
- ネットワーク: 1Gbps

### アプリケーションコンポーネント

#### バックエンド (Rust)
```yaml
# 主要な依存関係
axum: 0.8         # Webフレームワーク
sqlx: 0.8         # PostgreSQL接続
tokio: 1.45       # 非同期ランタイム
jsonwebtoken: 9.3 # JWT認証
meilisearch-sdk: 0.27 # 検索エンジン

# ポート
内部: 3000
外部: 3001
```

#### フロントエンド (React)
```yaml
# 主要な依存関係
React: 18.3.1     # UIフレームワーク
TypeScript: 5.8.3 # 型安全性
Vite: 7.0.0       # ビルドツール
pnpm: 8.0.0       # パッケージマネージャー

# PWA機能
manifest.json     # アプリメタデータ
sw.js            # Service Worker
icons/           # アプリアイコン
```

#### データベース
```yaml
PostgreSQL: 16    # メインデータベース
Meilisearch: v1.8 # 検索エンジン

# ポート
PostgreSQL: 5432
Meilisearch: 7700
```

## デプロイ手順

### Phase 1: 環境準備

#### 1.1 サーバー準備
```bash
# Ubuntu 22.04 LTS推奨
sudo apt update && sudo apt upgrade -y

# Docker環境構築
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable docker
sudo usermod -aG docker $USER
```

#### 1.2 ドメイン・DNS設定
```bash
# 必要なDNSレコード
A     miuchi.chat           -> サーバーIP
CNAME api.miuchi.chat       -> miuchi.chat
CNAME ws.miuchi.chat        -> miuchi.chat
```

#### 1.3 SSL証明書取得
```bash
# Certbot インストール
sudo apt install -y certbot python3-certbot-nginx

# 証明書取得
sudo certbot certonly --standalone -d miuchi.chat -d api.miuchi.chat
```

### Phase 2: 環境変数設定

#### 2.1 本番環境変数ファイル作成
```bash
# /opt/miuchi-chat/.env.production
cat > .env.production << 'EOF'
# === データベース ===
DATABASE_URL=postgresql://miuchi_user:secure_password@postgres:5432/miuchi_chat

# === Meilisearch ===
MEILI_URL=http://meilisearch:7700
MEILI_MASTER_KEY=production_master_key_32_chars_long

# === GitHub OAuth (本番用) ===
GITHUB_CLIENT_ID=your_production_client_id
GITHUB_CLIENT_SECRET=your_production_client_secret

# === JWT ===
JWT_SECRET=super_secure_jwt_secret_at_least_32_characters_long

# === サーバー ===
HOST=0.0.0.0
PORT=3000
RUST_LOG=info

# === 本番モード ===
DEV_MODE=false

# === フロントエンド ===
VITE_API_URL=https://api.miuchi.chat
VITE_WS_URL=wss://api.miuchi.chat/ws
EOF

# 権限設定
chmod 600 .env.production
```

#### 2.2 GitHub OAuth設定
```bash
# GitHub Developers Settings
# https://github.com/settings/developers

# New OAuth App:
# Application name: miuchi.chat (Production)
# Homepage URL: https://miuchi.chat
# Authorization callback URL: https://api.miuchi.chat/api/auth/callback
```

### Phase 3: 本番用Docker構成

#### 3.1 docker-compose.prod.yml作成
```yaml
version: '3.8'

services:
  # === バックエンド ===
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    container_name: miuchi-backend-prod
    env_file:
      - .env.production
    ports:
      - "3001:3000"
    depends_on:
      - postgres
      - meilisearch
    volumes:
      - ./uploads:/app/uploads
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # === フロントエンド (Nginx) ===
  frontend:
    build:
      context: ./frontend
      dockerfile: ../Dockerfile.frontend
      args:
        - VITE_API_URL=https://api.miuchi.chat
        - VITE_WS_URL=wss://api.miuchi.chat/ws
    container_name: miuchi-frontend-prod
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    restart: unless-stopped
    depends_on:
      - backend

  # === データベース ===
  postgres:
    image: postgres:16
    container_name: miuchi-postgres-prod
    environment:
      POSTGRES_USER: miuchi_user
      POSTGRES_PASSWORD: secure_password
      POSTGRES_DB: miuchi_chat
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d
    ports:
      - "127.0.0.1:5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "miuchi_user", "-d", "miuchi_chat"]
      interval: 30s
      timeout: 10s
      retries: 3

  # === 検索エンジン ===
  meilisearch:
    image: getmeili/meilisearch:v1.8
    container_name: miuchi-meilisearch-prod
    environment:
      MEILI_MASTER_KEY: production_master_key_32_chars_long
      MEILI_ENV: production
    volumes:
      - meilisearch_data:/meili_data
    ports:
      - "127.0.0.1:7700:7700"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7700/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
    driver: local
  meilisearch_data:
    driver: local

networks:
  default:
    name: miuchi-chat-prod
```

#### 3.2 Nginx設定
```nginx
# ./nginx/nginx.conf
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:3000;
    }

    # HTTPS Redirect
    server {
        listen 80;
        server_name miuchi.chat api.miuchi.chat;
        return 301 https://$server_name$request_uri;
    }

    # Main Application
    server {
        listen 443 ssl http2;
        server_name miuchi.chat;
        
        ssl_certificate /etc/letsencrypt/live/miuchi.chat/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/miuchi.chat/privkey.pem;
        
        root /usr/share/nginx/html;
        index index.html;
        
        # PWA Support
        location /manifest.json {
            expires 1d;
            add_header Cache-Control "public, immutable";
        }
        
        location /sw.js {
            expires epoch;
            add_header Cache-Control "no-cache";
        }
        
        # Static Assets
        location /icons/ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
        
        # SPA Fallback
        location / {
            try_files $uri $uri/ /index.html;
        }
    }

    # API Server
    server {
        listen 443 ssl http2;
        server_name api.miuchi.chat;
        
        ssl_certificate /etc/letsencrypt/live/miuchi.chat/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/miuchi.chat/privkey.pem;
        
        # WebSocket Upgrade
        location /ws {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # API Endpoints
        location / {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

### Phase 4: Dockerfile最適化

#### 4.1 本番用Rust Dockerfile
```dockerfile
# Dockerfile.backend.prod
FROM rust:1.75 AS builder

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src/ ./src/
COPY migrations/ ./migrations/

# 本番ビルド
RUN cargo build --release

FROM debian:bookworm-slim

# 実行時依存関係
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# バイナリコピー
COPY --from=builder /app/target/release/miuchi-chat ./
COPY --from=builder /app/migrations ./migrations/

# 非rootユーザー
RUN useradd -r -s /bin/false appuser
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["./miuchi-chat"]
```

#### 4.2 本番用React Dockerfile
```dockerfile
# Dockerfile.frontend.prod
FROM node:20-alpine AS builder

WORKDIR /app

# pnpm インストール
RUN npm install -g pnpm@8.0.0

# 依存関係インストール
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ソースコピー
COPY . .

# 本番ビルド
ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}

RUN pnpm run build

# 本番イメージ
FROM nginx:alpine

# Nginx設定
COPY --from=builder /app/dist /usr/share/nginx/html

# SSL/証明書マウント準備
RUN mkdir -p /etc/letsencrypt

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
```

### Phase 5: デプロイ実行

#### 5.1 初回デプロイ
```bash
# プロジェクトクローン
git clone https://github.com/your-org/miuchi.chat.git
cd miuchi.chat

# 環境変数設定
cp .env.production.example .env.production
# 実際の値を設定

# GitHub OAuth設定確認
# GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET

# 本番ビルド&起動
docker compose -f docker-compose.prod.yml up -d --build

# ログ確認
docker compose -f docker-compose.prod.yml logs -f
```

#### 5.2 データベースマイグレーション
```bash
# マイグレーション実行確認
docker compose -f docker-compose.prod.yml exec backend bash
./sqlx migrate run --database-url $DATABASE_URL

# または初期データ挿入が必要な場合
docker compose -f docker-compose.prod.yml exec postgres psql -U miuchi_user -d miuchi_chat
```

#### 5.3 ヘルスチェック
```bash
# API健全性確認
curl https://api.miuchi.chat/health
curl https://api.miuchi.chat/db-health

# フロントエンド確認
curl -I https://miuchi.chat

# WebSocket確認
wscat -c wss://api.miuchi.chat/ws
```

### Phase 6: 運用・監視

#### 6.1 ログ監視
```bash
# アプリケーションログ
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend

# システムログ
journalctl -u docker -f
```

#### 6.2 バックアップ
```bash
# データベースバックアップ
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U miuchi_user miuchi_chat > backup_$(date +%Y%m%d).sql

# Meilisearchバックアップ
docker compose -f docker-compose.prod.yml exec meilisearch curl -X POST "http://localhost:7700/dumps"
```

#### 6.3 更新手順
```bash
# 新バージョンデプロイ
git pull origin main
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --build

# ローリング更新（ダウンタイム最小化）
docker compose -f docker-compose.prod.yml up -d --no-deps backend
docker compose -f docker-compose.prod.yml up -d --no-deps frontend
```

## トラブルシューティング

### 一般的な問題

#### SSL証明書エラー
```bash
# 証明書更新
sudo certbot renew
docker compose -f docker-compose.prod.yml restart frontend
```

#### GitHub OAuth認証失敗
- 本番用クライアントIDが正しく設定されているか確認
- コールバックURLが正確か確認
- DEV_MODEがfalseに設定されているか確認

#### WebSocket接続失敗
- Nginxのproxy設定確認
- ファイアウォール設定確認
- ブラウザコンソールでエラーメッセージ確認

#### データベース接続エラー
```bash
# PostgreSQL状態確認
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U miuchi_user

# 接続文字列確認
echo $DATABASE_URL
```

### パフォーマンスチューニング

#### PostgreSQL最適化
```sql
-- postgresql.conf 調整
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
```

#### Meilisearch最適化
```bash
# インデックス設定
curl -X PUT "http://localhost:7700/indexes/messages/settings" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  -d '{
    "searchableAttributes": ["content", "username"],
    "displayedAttributes": ["*"],
    "rankingRules": ["words", "typo", "proximity", "attribute", "sort", "exactness"],
    "stopWords": ["の", "に", "は", "を", "が", "で", "と", "も"]
  }'
```

## セキュリティ考慮事項

### 必須セキュリティ設定

1. **環境変数の保護**
   - `.env.production`の権限を600に設定
   - 本番用の強力なパスワード・シークレット使用

2. **ネットワークセキュリティ**
   - ファイアウォール設定 (80, 443のみ開放)
   - 内部サービスポートの外部非公開

3. **SSL/TLS設定**
   - 強力な暗号化スイート使用
   - HSTS有効化
   - 定期的な証明書更新

4. **アプリケーションセキュリティ**
   - CORS設定の適切な制限
   - JWT有効期限の適切な設定
   - SQLインジェクション対策（sqlx使用）

5. **定期的なアップデート**
   - OS・Docker・依存関係の定期更新
   - セキュリティパッチの適用

## 詳細コスト比較表

### 💰 サービス別月額コスト

| 構成 | CPU/RAM | VPS | DB | 検索 | CDN | 監視 | 合計 |
|------|---------|-----|----|----- |----|------|------|
| **Docker+VPS** | 4vCPU/8GB | $40 | 含む | 含む | 無料 | 無料 | **$40** |
| **フルマネージド** | auto | $50 | $25 | $40 | $10 | $10 | **$135** |
| **クラウド** | auto | $80 | $45 | $60 | $15 | $20 | **$220** |
| **ハイブリッド** | 2vCPU/4GB | $20 | $5 | 含む | 無料 | 無料 | **$25** |

### 🌐 具体的サービス提案

#### 1. 推奨構成 (Docker + VPS)

**VPSプロバイダー比較:**

| プロバイダー | 仕様 | 価格/月 | 特徴 |
|-------------|------|---------|------|
| **Hetzner Cloud** ⭐ | 4vCPU/8GB/160GB | €34 ($38) | 高コスパ、EU拠点 |
| **DigitalOcean** | 4vCPU/8GB/160GB | $48 | シンプル、豊富なガイド |
| **Vultr** | 4vCPU/8GB/160GB | $48 | 高性能、日本リージョン |
| **Linode** | 4vCPU/8GB/160GB | $48 | 安定性、技術サポート |

**推奨**: Hetzner Cloud（コスパ最高、EU拠点でもレイテンシ良好）

**設定例:**
```bash
# Hetzner Cloud設定
インスタンス: CCX23 (4vCPU, 8GB RAM, 160GB SSD)
リージョン: ヘルシンキ (日本から150ms)
ネットワーク: 20TB/月 無料
バックアップ: +€6.8/月
```

#### 2. フルマネージド構成

**フロントエンド:**
- **Vercel** (推奨): 無料〜$20/月、Git連携、自動デプロイ、グローバルCDN
- **Netlify**: 無料〜$19/月、フォーム処理、A/Bテスト
- **Cloudflare Pages**: 無料、高速、Cloudflare統合

**バックエンド:**
- **Railway** (推奨): $5〜$20/月、Git連携、簡単デプロイ、PostgreSQL内蔵
- **Render**: $7〜$25/月、Docker対応、自動スケーリング
- **Fly.io**: $3〜$30/月、エッジ展開、WebSocket対応良好

**データベース:**
- **Neon** (推奨): $19/月〜、PostgreSQL、サーバーレス、分岐機能
- **PlanetScale**: $29/月〜、MySQL、分岐・マージ機能
- **Supabase**: $25/月〜、PostgreSQL、リアルタイム機能

**検索:**
- **Algolia**: $50/月〜、高性能検索、豊富な機能
- **Meilisearch Cloud**: $20/月〜、オープンソース、日本語対応

#### 3. クラウドネイティブ構成

**AWS構成例:**
```yaml
# AWS構成（月額約$200）
ECS Fargate: $50-80  # 2タスク常時実行
RDS PostgreSQL: $45  # db.t3.small MultiAZ
OpenSearch: $60      # t3.small.search
ALB: $20            # Application Load Balancer
CloudFront: $15     # CDN
Route53: $5         # DNS
```

**Google Cloud構成例:**
```yaml
# GCP構成（月額約$180）
Cloud Run: $40-60    # 2サービス
Cloud SQL: $35       # db-n1-standard-1
Elasticsearch: $55   # n1-standard-1
Load Balancer: $20   # HTTP(S) LB
Cloud CDN: $10       # CDN
Cloud DNS: $5        # DNS
```

#### 4. ハイブリッド構成（超低コスト）

**具体的構成:**
```yaml
# 超低コスト構成（月額$25）
Hetzner VPS: €18     # 2vCPU/4GB (バックエンド)
Railway DB: $5       # PostgreSQL 1GB
Cloudflare Pages: 無料 # フロントエンド
Cloudflare CDN: 無料   # CDN
UptimeRobot: 無料     # 監視
```

### 📊 スケーリング戦略

#### フェーズ1: 初期ローンチ（〜100ユーザー）
```
推奨: ハイブリッド構成 ($25/月)
- Hetzner VPS (2vCPU/4GB)
- Railway PostgreSQL
- Cloudflare Pages + CDN
```

#### フェーズ2: 成長期（100〜1000ユーザー）
```
推奨: Docker+VPS構成 ($40/月)
- Hetzner VPS (4vCPU/8GB)
- 自己ホストDB + Meilisearch
- Cloudflare CDN
```

#### フェーズ3: 拡張期（1000+ユーザー）
```
推奨: フルマネージド構成 ($135/月)
- Railway/Render バックエンド
- Neon PostgreSQL
- Algolia 検索
- Vercel フロントエンド
```

#### フェーズ4: エンタープライズ（5000+ユーザー）
```
推奨: クラウドネイティブ ($220/月)
- AWS/GCP マルチリージョン
- マネージドサービス
- 自動スケーリング
```

### 🔧 移行戦略

#### ステージ1→2: スケールアップ
```bash
# VPSリソース拡張
1. データバックアップ
2. より大きなVPSにマイグレーション
3. DNS切り替え
```

#### ステージ2→3: マネージド移行
```bash
# データベース移行
1. PostgreSQL → Neon移行
2. Meilisearch → Algolia移行
3. VPS → Railway移行
```

#### ステージ3→4: エンタープライズ化
```bash
# クラウド移行
1. インフラをTerraform化
2. CI/CD パイプライン構築
3. マルチリージョン展開
```

### 💡 コスト最適化のTips

1. **初期は必ずハイブリッド構成から始める**
2. **Cloudflareを最大活用**（無料CDN、無料DNS、無料SSL）
3. **モニタリングは無料ツールから**（UptimeRobot、Grafana Cloud無料枠）
4. **バックアップはrsync + cronで自動化**
5. **ログは早期にローテーション設定**
6. **画像最適化でCDN転送量削減**
7. **DB接続プール設定でリソース効率化**

## 🚀 実装手順: 推奨構成（Hetzner + Cloudflare）

### Step 1: アカウント開設・ドメイン取得

#### 1.1 Hetzner Cloud アカウント
```bash
# https://console.hetzner-cloud.com/
1. アカウント作成
2. 支払い方法設定（クレジットカード/PayPal）
3. プロジェクト作成: "miuchi-chat-prod"
```

#### 1.2 Cloudflare アカウント
```bash
# https://www.cloudflare.com/
1. アカウント作成
2. ドメイン登録: miuchi.chat ($15/年)
3. Cloudflare DNS に移行
```

#### 1.3 GitHub OAuth設定
```bash
# https://github.com/settings/developers
1. "New OAuth App"
2. Application name: "miuchi.chat (Production)"
3. Homepage URL: https://miuchi.chat
4. Authorization callback URL: https://api.miuchi.chat/api/auth/callback
5. Client ID/Secret を記録
```

### Step 2: Hetzner VPS 構築

#### 2.1 サーバー作成
```bash
# Hetzner Cloud Console
1. サーバー作成
   - イメージ: Ubuntu 22.04
   - タイプ: CCX23 (4vCPU, 8GB RAM)
   - 場所: Helsinki
   - ネットワーク: デフォルト
   - SSH Key: 追加
2. Firewall作成
   - インバウンド: 22 (SSH), 80 (HTTP), 443 (HTTPS)
   - アウトバウンド: all
```

#### 2.2 初期設定
```bash
# SSH接続
ssh root@your-server-ip

# システム更新
apt update && apt upgrade -y

# 必要なパッケージ
apt install -y curl wget git vim htop ufw fail2ban

# Docker インストール
curl -fsSL https://get.docker.com | sh
systemctl enable docker
usermod -aG docker root

# Docker Compose インストール
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

### Step 3: Cloudflare DNS設定

#### 3.1 DNS レコード
```bash
# Cloudflare Dashboard → DNS
A     miuchi.chat       → your-server-ip
CNAME api.miuchi.chat   → miuchi.chat
CNAME www.miuchi.chat   → miuchi.chat

# プロキシ設定
miuchi.chat: オレンジクラウド (ON)
api.miuchi.chat: グレークラウド (OFF) # WebSocket対応
```

#### 3.2 SSL/TLS設定
```bash
# SSL/TLS → Overview
暗号化モード: Full (strict)

# SSL/TLS → Edge Certificates
Always Use HTTPS: ON
Minimum TLS Version: 1.2
```

### Step 4: プロジェクトデプロイ

#### 4.1 プロジェクト準備
```bash
# プロジェクトクローン
cd /opt
git clone https://github.com/your-org/miuchi.chat.git
cd miuchi.chat
```

#### 4.2 環境変数設定
```bash
# 本番環境変数
cat > .env.production << 'EOF'
# データベース
DATABASE_URL=postgresql://miuchi_user:STRONG_PASSWORD_HERE@postgres:5432/miuchi_chat

# Meilisearch
MEILI_URL=http://meilisearch:7700
MEILI_MASTER_KEY=STRONG_MASTER_KEY_32_CHARS_HERE

# GitHub OAuth (本番用)
GITHUB_CLIENT_ID=your_production_client_id
GITHUB_CLIENT_SECRET=your_production_client_secret

# JWT
JWT_SECRET=super_secure_jwt_secret_at_least_32_characters_long

# サーバー
HOST=0.0.0.0
PORT=3000
RUST_LOG=info
DEV_MODE=false

# フロントエンド
VITE_API_URL=https://api.miuchi.chat
VITE_WS_URL=wss://api.miuchi.chat/ws
EOF

chmod 600 .env.production
```

#### 4.3 本番用Docker構成作成
```bash
# docker-compose.prod.yml を作成（前述の設定を使用）
# nginx/nginx.conf を作成（前述の設定を使用）
```

#### 4.4 初回デプロイ
```bash
# ビルド&起動
docker-compose -f docker-compose.prod.yml up -d --build

# ログ確認
docker-compose -f docker-compose.prod.yml logs -f

# ヘルスチェック
curl https://api.miuchi.chat/health
curl https://miuchi.chat
```

### Step 5: 監視・運用設定

#### 5.1 UptimeRobot設定
```bash
# https://uptimerobot.com/
1. アカウント作成（無料プラン）
2. Monitor追加:
   - miuchi.chat (HTTP)
   - api.miuchi.chat/health (HTTP)
3. アラート設定: Email通知
```

#### 5.2 バックアップ設定
```bash
# 自動バックアップスクリプト
cat > /opt/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups"

# ディレクトリ作成
mkdir -p $BACKUP_DIR

# データベースバックアップ
docker-compose -f /opt/miuchi.chat/docker-compose.prod.yml exec -T postgres pg_dump -U miuchi_user miuchi_chat > $BACKUP_DIR/db_$DATE.sql

# 古いバックアップ削除（7日以上）
find $BACKUP_DIR -name "db_*.sql" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /opt/backup.sh

# Cron設定（毎日3時にバックアップ）
echo "0 3 * * * /opt/backup.sh" | crontab -
```

### Step 6: セキュリティ強化

#### 6.1 ファイアウォール
```bash
# UFW設定
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80
ufw allow 443
ufw enable
```

#### 6.2 Fail2Ban設定
```bash
# SSH保護設定
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log
maxretry = 3
EOF

systemctl restart fail2ban
```

### Step 7: 継続的な運用

#### 7.1 更新手順
```bash
# アプリケーション更新
cd /opt/miuchi.chat
git pull origin main
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d --build

# 動作確認
curl https://api.miuchi.chat/health
```

#### 7.2 ログ監視
```bash
# リアルタイムログ
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f frontend

# エラーログ確認
docker-compose -f docker-compose.prod.yml logs backend | grep ERROR
```

## 📋 チェックリスト

### デプロイ前確認
- [ ] GitHub OAuth本番用クライアント作成済み
- [ ] 強力なパスワード・シークレット生成済み
- [ ] ドメイン取得・DNS設定完了
- [ ] サーバー構築・初期設定完了
- [ ] 環境変数ファイル作成・権限設定済み

### デプロイ後確認
- [ ] アプリケーション起動確認（https://miuchi.chat）
- [ ] API動作確認（https://api.miuchi.chat/health）
- [ ] WebSocket接続確認
- [ ] GitHub OAuth認証確認
- [ ] 検索機能確認
- [ ] PWA機能確認（manifest.json、Service Worker）

### 運用準備
- [ ] 監視設定（UptimeRobot）
- [ ] バックアップ設定（cron）
- [ ] セキュリティ設定（UFW、Fail2Ban）
- [ ] ログローテーション設定
- [ ] SSL証明書自動更新確認

## 結論

miuchi.chatの本番デプロイは、具体的なサービス提案と段階的なスケーリング戦略により、コスト効率と安定性を両立できます。

**推奨デプロイパス:**
1. **初期**: ハイブリッド構成（$25/月）で検証
2. **成長**: Docker+VPS構成（$40/月）で安定運用
3. **拡張**: フルマネージド構成（$135/月）で自動化
4. **エンタープライズ**: クラウドネイティブ（$220/月）で高可用性

各段階での移行も容易で、ビジネスの成長に合わせた柔軟なスケーリングが可能です。