// Mock WebSocket Service for development without backend
import type { WsMessage, Message } from '../types'

export class MockWebSocketService {
    private messageHandler: ((message: WsMessage) => void) | null = null
    private connected = false
    private currentRoom: string | null = null
    private mockMessages: Message[] = []

    connect(token: string) {
        console.log('MockWebSocketService: Connecting with token:', token)
        
        // Simulate connection delay
        setTimeout(() => {
            this.connected = true
            console.log('MockWebSocketService: Connected')
            
            if (this.messageHandler) {
                this.messageHandler({ 
                    type: 'room_joined', 
                    room: '', 
                    user_id: 'dev-user-octocat', 
                    username: 'octocat' 
                })
            }
        }, 1000)
    }

    disconnect() {
        this.connected = false
        this.currentRoom = null
        console.log('MockWebSocketService: Disconnected')
    }

    joinRoom(room: string, token: string) {
        if (!this.connected) {
            console.warn('MockWebSocketService: Not connected, cannot join room')
            return
        }

        this.currentRoom = room
        console.log(`MockWebSocketService: Joined room ${room}`)
        
        if (this.messageHandler) {
            this.messageHandler({
                type: 'room_joined',
                room,
                user_id: 'dev-user-octocat',
                username: 'octocat'
            })
        }

        // Send a welcome message after joining
        setTimeout(() => {
            if (this.messageHandler && this.currentRoom === room) {
                this.messageHandler({
                    type: 'message',
                    id: `mock-${Date.now()}`,
                    room,
                    user_id: 'system',
                    username: 'システム',
                    content: `${room} チャンネルへようこそ！これはモックメッセージです。`,
                    message_type: 'text',
                    timestamp: new Date().toISOString()
                })
            }
        }, 500)
    }

    sendMessage(room: string, content: string, messageType = 'text') {
        if (!this.connected || this.currentRoom !== room) {
            console.warn('MockWebSocketService: Not connected or wrong room, cannot send message')
            return
        }

        console.log(`MockWebSocketService: Sending message to ${room}: ${content}`)

        // Echo the message back as if it was sent successfully
        if (this.messageHandler) {
            this.messageHandler({
                type: 'message',
                id: `mock-${Date.now()}`,
                room,
                user_id: 'dev-user-octocat',
                username: 'octocat',
                content,
                message_type: messageType,
                timestamp: new Date().toISOString()
            })
        }

        // Simulate another user responding
        if (content.includes('こんにちは') || content.includes('hello')) {
            setTimeout(() => {
                if (this.messageHandler && this.currentRoom === room) {
                    this.messageHandler({
                        type: 'message',
                        id: `mock-reply-${Date.now()}`,
                        room,
                        user_id: 'mock-user-2',
                        username: 'Bot',
                        content: 'こんにちは！元気ですか？ 🤖',
                        message_type: 'text',
                        timestamp: new Date().toISOString()
                    })
                }
            }, 1000 + Math.random() * 2000)
        }
    }

    leaveRoom(room: string) {
        if (this.currentRoom === room) {
            this.currentRoom = null
            console.log(`MockWebSocketService: Left room ${room}`)
        }
    }

    onMessage(handler: (message: WsMessage) => void) {
        this.messageHandler = handler
    }

    isConnected(): boolean {
        return this.connected
    }
}
