use futures::{SinkExt, StreamExt};
use gloo::net::websocket::{futures::WebSocket, Message};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen_futures::spawn_local;
use yew::prelude::*;

use crate::services::auth::AuthService;
use crate::types::WsMessage;

pub struct WebSocketService {
    sender: Rc<RefCell<Option<futures::stream::SplitSink<WebSocket, Message>>>>,
    callback: Callback<WsMessage>,
}

impl WebSocketService {
    pub fn new(callback: Callback<WsMessage>) -> Self {
        Self {
            sender: Rc::new(RefCell::new(None)),
            callback,
        }
    }

    pub fn connect(&mut self, room: &str) {
        if let Some(token) = AuthService::get_token() {
            let ws_url = if cfg!(debug_assertions) {
                format!("ws://localhost:3001/ws?token={}", token)
            } else {
                let protocol =
                    if web_sys::window().unwrap().location().protocol().unwrap() == "https:" {
                        "wss"
                    } else {
                        "ws"
                    };

                let host = web_sys::window().unwrap().location().host().unwrap();

                format!("{}://{}/ws?token={}", protocol, host, token)
            };

            match WebSocket::open(&ws_url) {
                Ok(ws) => {
                    let (mut write, mut read) = ws.split();

                    // Join room immediately after connection
                    let join_message = WsMessage::JoinRoom {
                        room: room.to_string(),
                        token: token.clone(),
                    };

                    let sender = self.sender.clone();
                    let callback = self.callback.clone();

                    spawn_local(async move {
                        // Send join room message
                        if let Ok(json) = serde_json::to_string(&join_message) {
                            let _ = write.send(Message::Text(json)).await;
                        }

                        // Store the writer in the RefCell
                        *sender.borrow_mut() = Some(write);

                        // Listen for messages
                        while let Some(msg) = read.next().await {
                            match msg {
                                Ok(Message::Text(text)) => {
                                    if let Ok(ws_message) = serde_json::from_str::<WsMessage>(&text)
                                    {
                                        callback.emit(ws_message);
                                    }
                                }
                                Ok(Message::Bytes(_)) => {
                                    // Handle binary messages if needed
                                }
                                Err(_) => {
                                    log::error!("WebSocket error");
                                    break;
                                }
                            }
                        }
                    });
                }
                Err(e) => {
                    log::error!("Failed to open WebSocket: {:?}", e);
                }
            }
        }
    }

    pub fn send_message(&self, room: &str, content: &str) {
        let message = WsMessage::SendMessage {
            room: room.to_string(),
            content: content.to_string(),
            message_type: Some("text".to_string()),
        };

        if let Ok(json) = serde_json::to_string(&message) {
            let sender = self.sender.clone();
            spawn_local(async move {
                // Try to borrow the sender
                if let Ok(mut sender_ref) = sender.try_borrow_mut() {
                    if let Some(ref mut write) = *sender_ref {
                        if let Err(e) = write.send(Message::Text(json)).await {
                            log::error!("Failed to send WebSocket message: {:?}", e);
                        }
                    } else {
                        log::error!("WebSocket sender not available");
                    }
                } else {
                    log::error!("WebSocket sender is currently borrowed");
                }
            });
        }
    }

    pub fn disconnect(&mut self) {
        if let Ok(mut sender_ref) = self.sender.try_borrow_mut() {
            *sender_ref = None;
        }
    }
}
