import type { WsMessage } from '../types'
import { MockWebSocketService } from './mockWebSocket'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws'
const USE_MOCK = import.meta.env.VITE_USE_MOCK_WS === 'true' || false

// WebSocket接続の設定
const HEARTBEAT_INTERVAL = 30000 // 30秒
const CONNECTION_TIMEOUT = 10000 // 10秒
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_DELAY_BASE = 1000 // 1秒
const MAX_RECONNECT_DELAY = 30000 // 30秒
const MESSAGE_QUEUE_SIZE = 100

interface QueuedMessage {
    message: WsMessage
    timestamp: number
    retries: number
}

enum ConnectionState {
    DISCONNECTED = 'disconnected',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
    FAILED = 'failed'
}

class WebSocketService {
    private socket: WebSocket | null = null
    private messageHandler: ((message: WsMessage) => void) | null = null
    private connectionStateHandler: ((state: ConnectionState) => void) | null = null
    private reconnectAttempts = 0
    private maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS
    private reconnectTimeout: number | null = null
    private heartbeatInterval: number | null = null
    private connectionState: ConnectionState = ConnectionState.DISCONNECTED
    private messageQueue: QueuedMessage[] = []
    private currentToken: string = ''
    private lastPingTime: number = 0
    private connectionMetrics = {
        totalConnections: 0,
        totalReconnections: 0,
        totalMessages: 0,
        totalErrors: 0,
        averageLatency: 0,
        connectionUptime: 0
    }

    connect(token: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.currentToken = token
            
            if (this.socket) {
                this.disconnect()
            }

            this.updateConnectionState(ConnectionState.CONNECTING)
            this.connectionMetrics.totalConnections++

            try {
                // WebSocketのURLにtokenをクエリパラメータとして追加
                const wsUrl = `${WS_URL}?token=${encodeURIComponent(token)}`
                console.log('Attempting to connect to:', wsUrl)
                
                this.socket = new WebSocket(wsUrl)
                
                // 接続タイムアウト
                const connectionTimeout = setTimeout(() => {
                    if (this.socket?.readyState === WebSocket.CONNECTING) {
                        this.socket.close()
                        this.handleConnectionError(new Error('Connection timeout'))
                        reject(new Error('Connection timeout'))
                    }
                }, CONNECTION_TIMEOUT)

                this.socket.onopen = () => {
                    clearTimeout(connectionTimeout)
                    console.log('WebSocket connected successfully')
                    this.updateConnectionState(ConnectionState.CONNECTED)
                    this.reconnectAttempts = 0
                    this.startHeartbeat()
                    this.processMessageQueue()
                    resolve()
                }

                this.socket.onmessage = (event) => {
                    this.handleMessage(event)
                }

                this.socket.onclose = (event) => {
                    clearTimeout(connectionTimeout)
                    this.handleClose(event)
                    if (this.connectionState === ConnectionState.CONNECTING) {
                        reject(new Error(`Connection failed: ${event.code} ${event.reason}`))
                    }
                }

                this.socket.onerror = (error) => {
                    clearTimeout(connectionTimeout)
                    this.handleConnectionError(error)
                    if (this.connectionState === ConnectionState.CONNECTING) {
                        reject(error)
                    }
                }
            } catch (error) {
                console.error('Failed to create WebSocket connection:', error)
                this.handleConnectionError(error as Error)
                reject(error)
            }
        })
    }

    disconnect() {
        this.clearReconnectTimeout()
        this.stopHeartbeat()
        
        if (this.socket) {
            this.socket.close(1000, 'Client disconnect')
            this.socket = null
        }
        
        this.updateConnectionState(ConnectionState.DISCONNECTED)
        this.messageQueue = []
        console.log('WebSocket disconnected by client')
    }

    joinRoom(room: string) {
        const message: WsMessage = {
            type: 'join_room',
            room,
        }
        this.sendMessage(message)
    }

    sendChatMessage(room: string, content: string, messageType = 'text') {
        const message: WsMessage = {
            type: 'send_message',
            room,
            content,
            message_type: messageType,
        }
        this.sendMessage(message)
    }

    leaveRoom(room: string) {
        const message: WsMessage = {
            type: 'leave_room',
            room,
        }
        this.sendMessage(message)
    }

    onMessage(handler: (message: WsMessage) => void) {
        this.messageHandler = handler
    }
    
    onConnectionStateChange(handler: (state: ConnectionState) => void) {
        this.connectionStateHandler = handler
    }

    isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN
    }
    
    getConnectionState(): ConnectionState {
        return this.connectionState
    }
    
    getConnectionMetrics() {
        return { ...this.connectionMetrics }
    }
    
    // プライベートメソッド
    private sendMessage(message: WsMessage) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            try {
                const jsonMessage = JSON.stringify(message)
                if (jsonMessage.length > 64 * 1024) { // 64KB制限
                    console.error('Message too large:', jsonMessage.length)
                    return
                }
                
                this.socket.send(jsonMessage)
                this.connectionMetrics.totalMessages++
                console.debug('Message sent:', message.type)
            } catch (error) {
                console.error('Failed to send message:', error)
                this.connectionMetrics.totalErrors++
            }
        } else {
            // 接続していない場合はキューに追加
            this.queueMessage(message)
        }
    }
    
    private queueMessage(message: WsMessage) {
        if (this.messageQueue.length >= MESSAGE_QUEUE_SIZE) {
            this.messageQueue.shift() // 古いメッセージを削除
        }
        
        this.messageQueue.push({
            message,
            timestamp: Date.now(),
            retries: 0
        })
        
        console.debug('Message queued:', message.type)
        
        // 再接続を試行
        if (this.connectionState === ConnectionState.DISCONNECTED) {
            this.reconnect()
        }
    }
    
    private processMessageQueue() {
        if (this.messageQueue.length === 0) return
        
        console.log(`Processing ${this.messageQueue.length} queued messages`)
        
        const messagesToSend = [...this.messageQueue]
        this.messageQueue = []
        
        for (const queuedMessage of messagesToSend) {
            // 古すぎるメッセージは破棄（5分以上古い）
            if (Date.now() - queuedMessage.timestamp > 5 * 60 * 1000) {
                console.warn('Discarding old message:', queuedMessage.message.type)
                continue
            }
            
            this.sendMessage(queuedMessage.message)
        }
    }
    
    private handleMessage(event: MessageEvent) {
        try {
            const message = JSON.parse(event.data) as WsMessage
            
            // pongメッセージの処理
            if (message.type === 'pong' && message.timestamp) {
                const latency = Date.now() - message.timestamp
                this.updateLatency(latency)
                console.debug('Ping latency:', latency, 'ms')
                return
            }
            
            // レート制限エラーの処理
            if (message.type === 'rate_limited') {
                console.warn('Rate limited, retry after:', message.retry_after, 'seconds')
                // 必要に応じて再送機能を実装
                return
            }
            
            if (this.messageHandler) {
                this.messageHandler(message)
            }
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error, event.data)
            this.connectionMetrics.totalErrors++
        }
    }
    
    private handleClose(event: CloseEvent) {
        console.log('WebSocket disconnected:', event.code, event.reason)
        this.stopHeartbeat()
        
        if (event.code === 1000) {
            // 正常な切断
            this.updateConnectionState(ConnectionState.DISCONNECTED)
            return
        }
        
        if (event.code === 1008 || event.code === 1003) {
            // 認証エラーまたは無効なデータ
            console.error('Connection rejected by server:', event.reason)
            this.updateConnectionState(ConnectionState.FAILED)
            return
        }
        
        // 予期しない切断の場合は再接続を試行
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect()
        } else {
            console.error('Max reconnection attempts reached')
            this.updateConnectionState(ConnectionState.FAILED)
        }
    }
    
    private handleConnectionError(error: Event | Error) {
        console.error('WebSocket error:', error)
        this.connectionMetrics.totalErrors++
        
        if (this.messageHandler) {
            this.messageHandler({ 
                type: 'error', 
                message: 'WebSocket connection failed',
                code: 1006
            })
        }
    }
    
    private scheduleReconnect() {
        if (this.reconnectTimeout) {
            return
        }
        
        this.updateConnectionState(ConnectionState.RECONNECTING)
        this.reconnectAttempts++
        this.connectionMetrics.totalReconnections++
        
        // 指数バックオフ
        const delay = Math.min(
            RECONNECT_DELAY_BASE * Math.pow(2, this.reconnectAttempts - 1),
            MAX_RECONNECT_DELAY
        )
        
        console.log(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
        
        this.reconnectTimeout = window.setTimeout(() => {
            this.reconnectTimeout = null
            this.reconnect()
        }, delay)
    }
    
    private async reconnect() {
        if (!this.currentToken) {
            console.error('Cannot reconnect: no token available')
            return
        }
        
        try {
            await this.connect(this.currentToken)
        } catch (error) {
            console.error('Reconnection failed:', error)
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.scheduleReconnect()
            } else {
                this.updateConnectionState(ConnectionState.FAILED)
            }
        }
    }
    
    private clearReconnectTimeout() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout)
            this.reconnectTimeout = null
        }
    }
    
    private startHeartbeat() {
        this.stopHeartbeat()
        
        this.heartbeatInterval = window.setInterval(() => {
            if (this.socket?.readyState === WebSocket.OPEN) {
                this.lastPingTime = Date.now()
                this.sendMessage({
                    type: 'ping',
                    timestamp: this.lastPingTime
                })
            }
        }, HEARTBEAT_INTERVAL)
    }
    
    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval)
            this.heartbeatInterval = null
        }
    }
    
    private updateConnectionState(state: ConnectionState) {
        const previousState = this.connectionState
        this.connectionState = state
        
        if (this.connectionStateHandler && previousState !== state) {
            this.connectionStateHandler(state)
        }
        
        console.debug('Connection state changed:', previousState, '->', state)
    }
    
    private updateLatency(latency: number) {
        // 移動平均でレイテンシを計算
        this.connectionMetrics.averageLatency = 
            (this.connectionMetrics.averageLatency * 0.9) + (latency * 0.1)
    }
}


// 環境に応じてWebSocketサービスを選択
export const wsService = USE_MOCK ? new MockWebSocketService() : new WebSocketService()

// エクスポート
export { ConnectionState }
export type { QueuedMessage }
