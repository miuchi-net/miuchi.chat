# miuchi.chat 開発用Makefile

.PHONY: help setup dev-up dev-down dev-shell init-project check test build clean

help: ## このヘルプを表示
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

setup: ## 初回セットアップ（Dockerイメージのビルド）
	docker compose build

dev-up: ## 開発環境を起動
	docker compose up -d

dev-down: ## 開発環境を停止
	docker compose down

dev-shell: ## 開発コンテナに入る
	docker compose exec backend bash

init-project: ## 新しいRustプロジェクトを初期化
	docker compose exec backend cargo init --name miuchi-chat .

check: ## コードチェック
	docker compose exec backend cargo check

test: ## テスト実行
	docker compose exec backend cargo test

build: ## ビルド
	docker compose exec backend cargo build

clean: ## クリーンアップ
	docker compose exec backend cargo clean
	docker compose down --volumes --remove-orphans

# データベース関連
db-migrate: ## データベースマイグレーション実行
	docker compose exec backend sqlx migrate run

db-reset: ## データベースリセット
	docker compose exec backend sqlx database reset -y