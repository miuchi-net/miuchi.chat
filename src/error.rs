use crate::api::response::ErrorResponse;
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

/// アプリケーション全体のエラー型
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

    #[error("Validation error: {message}")]
    Validation {
        message: String,
        details: Option<serde_json::Value>,
    },

    #[error("Rate limit exceeded")]
    RateLimit,

    #[error("WebSocket error: {message}")]
    WebSocket { message: String },

    #[error("External service error: {service}")]
    ExternalService { service: String, message: String },

    #[error("Internal server error")]
    Internal(#[from] anyhow::Error),
}

impl AppError {
    /// エラーコードを返す
    pub fn code(&self) -> &'static str {
        match self {
            Self::Database(_) => "DATABASE_ERROR",
            Self::Authentication { .. } => "AUTHENTICATION_ERROR",
            Self::Authorization { .. } => "AUTHORIZATION_ERROR",
            Self::NotFound { .. } => "NOT_FOUND",
            Self::BadRequest { .. } => "BAD_REQUEST",
            Self::Validation { .. } => "VALIDATION_ERROR",
            Self::RateLimit => "RATE_LIMIT_EXCEEDED",
            Self::WebSocket { .. } => "WEBSOCKET_ERROR",
            Self::ExternalService { .. } => "EXTERNAL_SERVICE_ERROR",
            Self::Internal(_) => "INTERNAL_ERROR",
        }
    }

    /// HTTPステータスコードを返す
    pub fn status_code(&self) -> StatusCode {
        match self {
            Self::Database(_) | Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            Self::Authentication { .. } => StatusCode::UNAUTHORIZED,
            Self::Authorization { .. } => StatusCode::FORBIDDEN,
            Self::NotFound { .. } => StatusCode::NOT_FOUND,
            Self::BadRequest { .. } | Self::Validation { .. } => StatusCode::BAD_REQUEST,
            Self::RateLimit => StatusCode::TOO_MANY_REQUESTS,
            Self::WebSocket { .. } => StatusCode::BAD_REQUEST,
            Self::ExternalService { .. } => StatusCode::BAD_GATEWAY,
        }
    }

    /// 詳細情報を返す（ログ用）
    pub fn details(&self) -> Option<serde_json::Value> {
        match self {
            Self::Validation { details, .. } => details.clone(),
            Self::Database(e) => Some(json!({
                "database_error": e.to_string()
            })),
            Self::ExternalService { service, message } => Some(json!({
                "service": service,
                "error_message": message
            })),
            _ => None,
        }
    }

    /// ユーザー向けメッセージ（機密情報を含まない）
    pub fn user_message(&self) -> String {
        match self {
            Self::Database(_) => {
                "データベースエラーが発生しました。しばらく時間をおいて再試行してください。"
                    .to_string()
            }
            Self::Authentication { .. } => {
                "認証に失敗しました。再度ログインしてください。".to_string()
            }
            Self::Authorization { message } => message.clone(),
            Self::NotFound { resource } => format!("{}が見つかりません。", resource),
            Self::BadRequest { message } => message.clone(),
            Self::Validation { message, .. } => message.clone(),
            Self::RateLimit => {
                "送信回数が制限を超えました。しばらく時間をおいて再試行してください。".to_string()
            }
            Self::WebSocket { message } => format!("接続エラー: {}", message),
            Self::ExternalService { .. } => {
                "外部サービスとの通信でエラーが発生しました。".to_string()
            }
            Self::Internal(_) => {
                "内部エラーが発生しました。管理者にお問い合わせください。".to_string()
            }
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        // ログ出力（開発環境では詳細、本番環境では簡略化）
        if cfg!(debug_assertions) {
            tracing::error!("API Error: {:?}", self);
        } else {
            tracing::error!("API Error [{}]: {}", self.code(), self.user_message());
        }

        let response = if let Some(details) = self.details() {
            ErrorResponse::with_details(self.code(), &self.user_message(), details)
        } else {
            ErrorResponse::new(self.code(), &self.user_message())
        };

        (self.status_code(), Json(response)).into_response()
    }
}

/// 便利なヘルパー関数
impl AppError {
    pub fn auth(message: impl Into<String>) -> Self {
        Self::Authentication {
            message: message.into(),
        }
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::Authorization {
            message: message.into(),
        }
    }

    pub fn not_found(resource: impl Into<String>) -> Self {
        Self::NotFound {
            resource: resource.into(),
        }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::BadRequest {
            message: message.into(),
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation {
            message: message.into(),
            details: None,
        }
    }

    pub fn validation_with_details(message: impl Into<String>, details: serde_json::Value) -> Self {
        Self::Validation {
            message: message.into(),
            details: Some(details),
        }
    }

    pub fn ws_error(message: impl Into<String>) -> Self {
        Self::WebSocket {
            message: message.into(),
        }
    }

    pub fn external_service(service: impl Into<String>, message: impl Into<String>) -> Self {
        Self::ExternalService {
            service: service.into(),
            message: message.into(),
        }
    }
}

/// Result型のエイリアス
pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_codes() {
        assert_eq!(AppError::not_found("user").code(), "NOT_FOUND");
        assert_eq!(
            AppError::auth("invalid token").code(),
            "AUTHENTICATION_ERROR"
        );
        assert_eq!(
            AppError::forbidden("access denied").code(),
            "AUTHORIZATION_ERROR"
        );
    }

    #[test]
    fn test_status_codes() {
        assert_eq!(
            AppError::not_found("user").status_code(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            AppError::auth("invalid").status_code(),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            AppError::forbidden("denied").status_code(),
            StatusCode::FORBIDDEN
        );
    }

    #[test]
    fn test_user_messages() {
        let error = AppError::not_found("ルーム");
        assert_eq!(error.user_message(), "ルームが見つかりません。");

        let error = AppError::validation("ユーザー名が無効です");
        assert_eq!(error.user_message(), "ユーザー名が無効です");
    }

    #[test]
    fn test_validation_with_details() {
        let details = json!({"field": "username", "min_length": 3});
        let error = AppError::validation_with_details("Validation failed", details.clone());

        assert_eq!(error.code(), "VALIDATION_ERROR");
        assert_eq!(error.details(), Some(details));
    }
}
