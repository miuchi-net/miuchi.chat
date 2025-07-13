use chrono::{DateTime, Utc};
use serde::Serialize;

/// 統一されたAPIレスポンス形式
#[derive(Serialize)]
pub struct ApiResponse<T> {
    pub data: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<ResponseMeta>,
}

/// レスポンスメタデータ
#[derive(Serialize)]
pub struct ResponseMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_more: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    pub timestamp: DateTime<Utc>,
}

/// エラーレスポンス形式
#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: ErrorDetail,
}

/// エラー詳細
#[derive(Serialize)]
pub struct ErrorDetail {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
    pub timestamp: DateTime<Utc>,
}

impl<T> ApiResponse<T> {
    /// 簡単なデータレスポンス作成
    pub fn new(data: T) -> Self {
        Self {
            data,
            meta: Some(ResponseMeta {
                total: None,
                has_more: None,
                page_size: None,
                next_cursor: None,
                timestamp: Utc::now(),
            }),
        }
    }

    /// ページネーション付きレスポンス作成
    pub fn with_pagination(
        data: T,
        total: u64,
        has_more: bool,
        page_size: u32,
        next_cursor: Option<String>,
    ) -> Self {
        Self {
            data,
            meta: Some(ResponseMeta {
                total: Some(total),
                has_more: Some(has_more),
                page_size: Some(page_size),
                next_cursor,
                timestamp: Utc::now(),
            }),
        }
    }

    /// メタデータなしレスポンス
    pub fn data_only(data: T) -> Self {
        Self { data, meta: None }
    }
}

impl ErrorResponse {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            error: ErrorDetail {
                code: code.to_string(),
                message: message.to_string(),
                details: None,
                timestamp: Utc::now(),
            },
        }
    }

    pub fn with_details(code: &str, message: &str, details: serde_json::Value) -> Self {
        Self {
            error: ErrorDetail {
                code: code.to_string(),
                message: message.to_string(),
                details: Some(details),
                timestamp: Utc::now(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_simple_response() {
        let response = ApiResponse::new("hello world");
        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains("\"data\":\"hello world\""));
        assert!(json.contains("\"meta\""));
        assert!(json.contains("\"timestamp\""));
    }

    #[test]
    fn test_paginated_response() {
        let response = ApiResponse::with_pagination(
            vec!["item1", "item2"],
            100,
            true,
            50,
            Some("cursor123".to_string()),
        );
        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains("\"total\":100"));
        assert!(json.contains("\"has_more\":true"));
        assert!(json.contains("\"page_size\":50"));
        assert!(json.contains("\"next_cursor\":\"cursor123\""));
    }

    #[test]
    fn test_error_response() {
        let response = ErrorResponse::new("NOT_FOUND", "Resource not found");
        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains("\"code\":\"NOT_FOUND\""));
        assert!(json.contains("\"message\":\"Resource not found\""));
        assert!(json.contains("\"timestamp\""));
    }

    #[test]
    fn test_error_response_with_details() {
        let details = json!({"field": "username", "reason": "already_exists"});
        let response =
            ErrorResponse::with_details("VALIDATION_ERROR", "Validation failed", details);
        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains("\"details\""));
        assert!(json.contains("\"field\":\"username\""));
    }
}
