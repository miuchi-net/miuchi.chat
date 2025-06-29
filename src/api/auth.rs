use axum::{
    extract::{FromRequestParts, Query, State},
    http::{request::Parts, StatusCode},
    response::{Json, Redirect},
    routing::{get, post},
    Router,
};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use oauth2::{
    basic::BasicClient, AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken,
    RedirectUrl, Scope, TokenResponse as OAuth2TokenResponse, TokenUrl,
};
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};
use sqlx::PgPool;
use utoipa::ToSchema;

use crate::models::User;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // GitHub user ID
    pub username: String,
    pub email: Option<String>,
    pub aud: String, // Audience
    pub exp: usize, // Expiration time
    pub iat: usize, // Issued at
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StateClaims {
    pub nonce: String, // Random nonce
    pub exp: usize, // Expiration time (5 minutes)
    pub aud: String, // Audience
}

#[derive(Deserialize)]
pub struct GitHubUser {
    pub id: u64,
    pub login: String,
    pub email: Option<String>,
    pub avatar_url: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct LoginUrlResponse {
    pub login_url: String,
    pub state: String,
}

#[derive(Deserialize, ToSchema)]
pub struct CallbackQuery {
    pub code: String,
    pub state: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: u64,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct UserResponse {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
}

/// JWT認証されたユーザー情報を表すextractor
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: String,
    pub username: String,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
}

impl FromRequestParts<PgPool> for AuthUser {
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, state: &PgPool) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|header| header.to_str().ok())
            .ok_or(StatusCode::UNAUTHORIZED)?;

        if !auth_header.starts_with("Bearer ") {
            return Err(StatusCode::UNAUTHORIZED);
        }

        let token = auth_header.trim_start_matches("Bearer ");
        
        let secret = std::env::var("JWT_SECRET")
            .unwrap_or_else(|_| "development_secret_key_change_in_production".to_string());

        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_audience(&["miuchi.chat"]);

        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(secret.as_ref()),
            &validation,
        )
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

        // ユーザーIDをUUIDにパース
        let user_id = token_data.claims.sub.parse::<uuid::Uuid>()
            .map_err(|_| StatusCode::UNAUTHORIZED)?;
        
        // DBからユーザー情報を取得して検証
        let user = User::find_by_id(state, user_id)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::UNAUTHORIZED)?;

        Ok(AuthUser {
            user_id: user.id.to_string(),
            username: user.username,
            email: user.email,
            avatar_url: user.avatar_url,
        })
    }
}

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/login-url", get(login_url))
        .route("/callback", get(callback))
        .route("/dev-login", post(dev_login))
        .route("/me", get(me))
}

fn create_oauth_client() -> anyhow::Result<BasicClient> {
    let client_id = std::env::var("GITHUB_CLIENT_ID_DEV")
        .unwrap_or_else(|_| "dummy_client_id".to_string());
    let client_secret = std::env::var("GITHUB_CLIENT_SECRET_DEV")
        .unwrap_or_else(|_| "dummy_client_secret".to_string());
    
    let auth_url = AuthUrl::new("https://github.com/login/oauth/authorize".to_string())?;
    let token_url = TokenUrl::new("https://github.com/login/oauth/access_token".to_string())?;
    
    let redirect_url = RedirectUrl::new(format!("{}/api/auth/callback", 
        std::env::var("BASE_URL").unwrap_or_else(|_| "http://localhost:3001".to_string())))?;
    
    Ok(BasicClient::new(
        ClientId::new(client_id),
        Some(ClientSecret::new(client_secret)),
        auth_url,
        Some(token_url),
    )
    .set_redirect_uri(redirect_url))
}

fn create_jwt_token(user: &GitHubUser) -> anyhow::Result<String> {
    let secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "development_secret_key_change_in_production".to_string());
    
    let now = Utc::now();
    let exp = now + Duration::hours(24);
    
    let claims = Claims {
        sub: user.id.to_string(),
        username: user.login.clone(),
        email: user.email.clone(),
        aud: "miuchi.chat".to_string(),
        exp: exp.timestamp() as usize,
        iat: now.timestamp() as usize,
    };
    
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )?;
    
    Ok(token)
}

fn create_jwt_token_from_user(user: &User) -> anyhow::Result<String> {
    let secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "development_secret_key_change_in_production".to_string());
    
    let now = Utc::now();
    let exp = now + Duration::hours(24);
    
    let claims = Claims {
        sub: user.id.to_string(),
        username: user.username.clone(),
        email: user.email.clone(),
        aud: "miuchi.chat".to_string(),
        exp: exp.timestamp() as usize,
        iat: now.timestamp() as usize,
    };
    
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )?;
    
    Ok(token)
}

fn create_state_token() -> anyhow::Result<String> {
    let secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "development_secret_key_change_in_production".to_string());
    
    let now = Utc::now();
    let exp = now + Duration::minutes(5); // 5分で期限切れ
    
    // ランダムなnonceを生成
    let nonce = general_purpose::URL_SAFE_NO_PAD.encode(
        uuid::Uuid::new_v4().as_bytes()
    );
    
    let claims = StateClaims {
        nonce,
        exp: exp.timestamp() as usize,
        aud: "miuchi.chat.oauth".to_string(),
    };
    
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )?;
    
    Ok(token)
}

fn verify_state_token(token: &str) -> anyhow::Result<StateClaims> {
    let secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "development_secret_key_change_in_production".to_string());

    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&["miuchi.chat.oauth"]);

    let token_data = decode::<StateClaims>(
        token,
        &DecodingKey::from_secret(secret.as_ref()),
        &validation,
    )?;

    Ok(token_data.claims)
}

#[utoipa::path(
    get,
    path = "/auth/login-url",
    responses(
        (status = 200, description = "GitHub OAuth login URL generated successfully", body = LoginUrlResponse)
    ),
    tag = "Authentication"
)]
async fn login_url(
    State(_pool): State<PgPool>,
) -> Result<Json<LoginUrlResponse>, StatusCode> {
    let client = create_oauth_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // JWT署名付きstateトークンを生成
    let state_token = create_state_token()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let csrf_token = CsrfToken::new(state_token.clone());
    
    let (auth_url, _) = client
        .authorize_url(|| csrf_token)
        .add_scope(Scope::new("user:email".to_string()))
        .url();
    
    Ok(Json(LoginUrlResponse {
        login_url: auth_url.to_string(),
        state: state_token,
    }))
}

#[utoipa::path(
    get,
    path = "/auth/callback",
    params(
        ("code" = String, Query, description = "OAuth authorization code"),
        ("state" = String, Query, description = "CSRF state token")
    ),
    responses(
        (status = 302, description = "Redirect to frontend with token"),
        (status = 400, description = "Invalid callback parameters"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Authentication"
)]
async fn callback(
    State(_pool): State<PgPool>,
    Query(params): Query<CallbackQuery>,
) -> Result<Redirect, StatusCode> {
    // JWT署名付きstateトークンを検証
    tracing::info!("Callback received with state: {}", params.state);
    
    match verify_state_token(&params.state) {
        Ok(state_claims) => {
            tracing::info!("Valid state token verified with nonce: {}", state_claims.nonce);
        }
        Err(e) => {
            tracing::warn!("Invalid state token: {}", e);
            return Err(StatusCode::BAD_REQUEST);
        }
    }
    
    let client = create_oauth_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // GitHubからアクセストークンを取得
    let token_result = client
        .exchange_code(AuthorizationCode::new(params.code))
        .request_async(oauth2::reqwest::async_http_client)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // GitHubユーザー情報を取得
    let http_client = reqwest::Client::new();
    let user_response = http_client
        .get("https://api.github.com/user")
        .bearer_auth(token_result.access_token().secret())
        .header("User-Agent", "miuchi.chat")
        .send()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let github_user: GitHubUser = user_response
        .json()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // ユーザーをDBに保存またはアップデート
    let user = User::create_or_update_from_github(
        &_pool,
        github_user.id as i64,
        github_user.login.clone(),
        github_user.email.clone(),
        Some(github_user.avatar_url.clone()),
    )
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // JWTトークンを生成
    let jwt_token = create_jwt_token_from_user(&user)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // フロントエンドのコールバックページにリダイレクトして、トークンをクエリパラメータで渡す
    let frontend_url = std::env::var("FRONTEND_URL")
        .unwrap_or_else(|_| "http://localhost:5173".to_string());
    let redirect_url = format!("{}/callback?token={}", frontend_url, jwt_token);
    
    Ok(Redirect::to(&redirect_url))
}

#[utoipa::path(
    post,
    path = "/auth/dev-login",
    responses(
        (status = 200, description = "Development login successful", body = TokenResponse)
    ),
    tag = "Authentication"
)]
async fn dev_login(State(pool): State<PgPool>) -> Result<Json<TokenResponse>, StatusCode> {
    // 開発環境でのみ有効
    if std::env::var("DEV_MODE").unwrap_or_else(|_| "false".to_string()) != "true" {
        return Err(StatusCode::FORBIDDEN);
    }
    
    // 開発用ユーザーをDBから取得
    let user = User::find_by_github_id(&pool, 999999)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let jwt_token = create_jwt_token_from_user(&user)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(Json(TokenResponse {
        access_token: jwt_token,
        token_type: "Bearer".to_string(),
        expires_in: 86400,
    }))
}

#[utoipa::path(
    get,
    path = "/auth/me",
    responses(
        (status = 200, description = "Current user information", body = UserResponse),
        (status = 401, description = "Unauthorized")
    ),
    tag = "Authentication",
    security(
        ("bearer_auth" = [])
    )
)]
async fn me(State(_pool): State<PgPool>, user: AuthUser) -> Json<UserResponse> {
    Json(UserResponse {
        id: user.user_id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
    })
}