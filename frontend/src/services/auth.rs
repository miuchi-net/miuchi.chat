use crate::types::User;
use gloo_storage::{LocalStorage, Storage};

const TOKEN_KEY: &str = "miuchi_chat_token";
const USER_KEY: &str = "miuchi_chat_user";

pub struct AuthService;

impl AuthService {
    pub fn get_token() -> Option<String> {
        LocalStorage::get(TOKEN_KEY).ok()
    }

    pub fn set_token(token: &str) {
        LocalStorage::set(TOKEN_KEY, token).ok();
    }

    pub fn remove_token() {
        LocalStorage::delete(TOKEN_KEY);
    }

    pub fn get_user() -> Option<User> {
        LocalStorage::get(USER_KEY).ok()
    }

    pub fn set_user(user: &User) {
        LocalStorage::set(USER_KEY, user).ok();
    }

    pub fn remove_user() {
        LocalStorage::delete(USER_KEY);
    }

    pub fn is_authenticated() -> bool {
        Self::get_token().is_some()
    }

    pub fn logout() {
        Self::remove_token();
        Self::remove_user();
    }

    pub fn get_login_url() -> String {
        let base_url = if cfg!(debug_assertions) {
            "http://localhost:3001".to_string()
        } else {
            web_sys::window().unwrap().location().origin().unwrap()
        };
        format!("{}/api/auth/login-url", base_url)
    }

    pub fn get_dev_login_url() -> String {
        let base_url = if cfg!(debug_assertions) {
            "http://localhost:3001".to_string()
        } else {
            web_sys::window().unwrap().location().origin().unwrap()
        };
        format!("{}/api/auth/dev-login", base_url)
    }

    pub fn get_me_url() -> String {
        let base_url = if cfg!(debug_assertions) {
            "http://localhost:3001".to_string()
        } else {
            web_sys::window().unwrap().location().origin().unwrap()
        };
        format!("{}/api/auth/me", base_url)
    }
}
