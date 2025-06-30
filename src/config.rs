use std::time::Duration;

// WebSocket接続の設定
pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
pub const CLIENT_TIMEOUT: Duration = Duration::from_secs(60);
pub const MAX_MESSAGE_SIZE: usize = 64 * 1024; // 64KB
pub const RATE_LIMIT_MESSAGES: usize = 10; // 10 messages per window
pub const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(1);
pub const MAX_CONNECTIONS_PER_USER: usize = 5;
pub const WEBSOCKET_TIMEOUT: Duration = Duration::from_secs(5);

// 認証設定
pub const JWT_EXPIRY_HOURS: i64 = 24;
pub const OAUTH_STATE_EXPIRY_MINUTES: i64 = 5;

// データベース設定
pub const MESSAGE_PAGINATION_LIMIT: usize = 50;
pub const MAX_ROOM_NAME_LENGTH: usize = 100;
pub const MAX_MESSAGE_CONTENT_LENGTH: usize = 4000;

// 検索設定
pub const SEARCH_RESULTS_LIMIT: usize = 100;