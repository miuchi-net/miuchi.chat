export interface User {
    id: string;
    username: string;
    email?: string;
    avatar_url?: string;
    display_name?: string;
}

export interface Message {
    id: string;
    room_id: string;
    author_id: string;
    author_name: string;
    content: string;
    message_type?: 'text' | 'image' | 'file' | 'system';
    created_at: string;
}

export interface Room {
    id: string;
    name: string;
    description?: string;
    created_at?: string;
}

export interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

export interface LoginUrlResponse {
    login_url: string;
    state: string;
}

export interface MessagesResponse {
    messages: Message[];
    total: number;
    has_more: boolean;
}

export interface SendMessageRequest {
    content: string;
    message_type?: 'text' | 'image' | 'file';
}

export interface SendMessageResponse {
    id: string;
    timestamp: string;
}

// WebSocket message types
export type WsMessage =
    | { type: 'join_room'; room: string; token: string }
    | { type: 'send_message'; room: string; content: string; message_type?: string }
    | { type: 'leave_room'; room: string }
    | { type: 'room_joined'; room: string; user_id: string; username: string }
    | { type: 'message'; id: string; room: string; user_id: string; username: string; content: string; message_type: string; timestamp: string }
    | { type: 'user_joined'; room: string; user_id: string; username: string }
    | { type: 'user_left'; room: string; user_id: string; username: string }
    | { type: 'error'; message: string };
