use std::collections::VecDeque;
use wasm_bindgen_futures::spawn_local;
use web_sys::HtmlInputElement;
use yew::prelude::*;
use yew_router::prelude::*;

use crate::services::{api::ApiClient, auth::AuthService, websocket::WebSocketService};
use crate::types::{Message, MessageType, WsMessage};
use crate::Route;

#[derive(Properties, PartialEq)]
pub struct ChatProps {
    pub room: String,
}

#[function_component(Chat)]
pub fn chat(props: &ChatProps) -> Html {
    let navigator = use_navigator().unwrap();
    let messages = use_state(|| VecDeque::<Message>::new());
    let current_user = use_state(|| AuthService::get_user());
    let connected = use_state(|| false);
    let websocket_service = use_state(|| None::<WebSocketService>);
    let input_ref = use_node_ref();

    // Check authentication
    {
        let navigator = navigator.clone();
        use_effect_with((), move |_| {
            if !AuthService::is_authenticated() {
                navigator.push(&Route::Login);
            }
            || ()
        });
    }

    // Load initial messages
    {
        let messages = messages.clone();
        let room = props.room.clone();

        use_effect_with(room.clone(), move |room| {
            let messages = messages.clone();
            let room = room.clone();

            spawn_local(async move {
                log::info!("Loading initial messages for room: {}", room);
                let api = ApiClient::new();
                if let Ok(response) = api.get_messages(&room, Some(50), None).await {
                    let mut msg_deque = VecDeque::new();
                    log::info!("API returned {} messages", response.messages.len());
                    // Reverse messages to show newest at bottom
                    for (index, msg) in response.messages.into_iter().rev().enumerate() {
                        log::info!(
                            "Processing message {}: {} by {}",
                            index,
                            msg.content,
                            msg.username
                        );
                        msg_deque.push_back(msg);
                    }
                    let msg_count = msg_deque.len();
                    log::info!("Setting {} messages to state", msg_count);
                    messages.set(msg_deque);
                    log::info!("State updated with {} initial messages", msg_count);
                }
            });

            || ()
        });
    }

    // Setup WebSocket connection
    {
        let messages = messages.clone();
        let room = props.room.clone();
        let connected = connected.clone();
        let websocket_service = websocket_service.clone();

        use_effect_with(room, move |room| {
            let messages = messages.clone();
            let connected = connected.clone();
            let websocket_service = websocket_service.clone();

            let ws_callback = {
                let messages = messages.clone();
                let connected = connected.clone();
                let room = room.clone();

                Callback::from(move |ws_message: WsMessage| {
                    log::info!("Received WebSocket message: {:?}", ws_message);
                    match ws_message {
                        WsMessage::RoomJoined { .. } => {
                            connected.set(true);
                            log::info!("Connected to room");
                        }
                        WsMessage::Message {
                            id,
                            room: _,
                            user_id,
                            username,
                            content,
                            message_type: _,
                            timestamp,
                        } => {
                            log::info!("Received message: {} from {}", content, username);

                            let new_message = Message {
                                id: id.clone(),
                                room_id: room.clone(),
                                user_id,
                                username,
                                content,
                                timestamp,
                                message_type: MessageType::Text,
                            };

                            // メッセージを安全に追加
                            messages.set({
                                let current_messages = (*messages).clone();
                                let mut new_messages = current_messages;

                                // 重複チェック
                                if !new_messages.iter().any(|msg| msg.id == id) {
                                    new_messages.push_back(new_message);
                                    log::info!(
                                        "Added new message to UI, total messages: {}",
                                        new_messages.len()
                                    );
                                } else {
                                    log::info!("Message already exists, skipping");
                                }
                                new_messages
                            });
                        }
                        WsMessage::Error { message } => {
                            log::error!("WebSocket error: {}", message);
                        }
                        _ => {}
                    }
                })
            };

            let mut ws_service = WebSocketService::new(ws_callback);
            ws_service.connect(room);
            websocket_service.set(Some(ws_service));

            move || {
                connected.set(false);
            }
        });
    }

    let on_send_message = {
        let input_ref = input_ref.clone();
        let room = props.room.clone();
        let websocket_service = websocket_service.clone();

        Callback::from(move |_| {
            if let Some(input) = input_ref.cast::<HtmlInputElement>() {
                let content = input.value().trim().to_string();
                if !content.is_empty() {
                    // WebSocket経由でメッセージを送信
                    if let Some(ws_service) = websocket_service.as_ref() {
                        ws_service.send_message(&room, &content);
                        log::info!("Message sent via WebSocket");
                    } else {
                        log::error!("WebSocket not connected");
                    }

                    input.set_value("");
                }
            }
        })
    };

    let on_key_press = {
        let on_send_message = on_send_message.clone();

        Callback::from(move |e: KeyboardEvent| {
            if e.key() == "Enter" && !e.shift_key() {
                e.prevent_default();
                on_send_message.emit(());
            }
        })
    };

    let on_logout = {
        let navigator = navigator.clone();

        Callback::from(move |_| {
            AuthService::logout();
            navigator.push(&Route::Login);
        })
    };

    html! {
        <div class="tui-container">
            <div class="tui-header">
                <span>{format!("miuchi.chat - #{}", props.room)}</span>
                <div>
                    <span class="tui-status">
                        {
                            if *connected {
                                "Connected"
                            } else {
                                "Connecting..."
                            }
                        }
                    </span>
                    <button class="tui-button" onclick={on_logout}>
                        {"Logout"}
                    </button>
                </div>
            </div>
            <div class="tui-main">
                <div class="tui-sidebar">
                    <h3>{"Rooms"}</h3>
                    <div>
                        <div style="color: #51cf66;">{"# general"}</div>
                    </div>

                    {
                        if let Some(user) = current_user.as_ref() {
                            html! {
                                <div style="margin-top: 20px;">
                                    <h3>{"User"}</h3>
                                    <div class="tui-status">
                                        {&user.username}
                                    </div>
                                </div>
                            }
                        } else {
                            html! {}
                        }
                    }
                </div>
                <div class="tui-content">
                    <div class="tui-messages" id="messages-container">
                        <div class="tui-status" style="font-size: 12px; color: #666; margin-bottom: 10px;">
                            {format!("Messages: {} | Connected: {}", messages.len(), *connected)}
                        </div>
                        {
                            messages.iter().enumerate().map(|(index, message)| {
                                html! {
                                    <div class="tui-message" key={message.id.clone()}>
                                        <div class="tui-message-header">
                                            {format!("[{}] {} [{}] {}",
                                                index + 1,
                                                message.timestamp.format("%H:%M:%S"),
                                                message.username,
                                                &message.id[..8]
                                            )}
                                        </div>
                                        <div class="tui-message-content">
                                            {&message.content}
                                        </div>
                                    </div>
                                }
                            }).collect::<Html>()
                        }
                    </div>
                    <div class="tui-input-area">
                        <textarea
                            ref={input_ref}
                            class="tui-input"
                            placeholder="Type a message... (Enter to send)"
                            rows="2"
                            onkeypress={on_key_press}
                        />
                        <button class="tui-button" onclick={on_send_message.reform(|_: MouseEvent| ())}>
                            {"Send"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    }
}
