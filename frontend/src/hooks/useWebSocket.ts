import { useEffect, useRef, useState } from 'react'
import { wsService, ConnectionState } from '../services/websocket'
import type { Message, WsMessage } from '../types'

interface UseWebSocketOptions {
  roomId?: string
  onMessage?: (message: Message) => void
  onRoomCreated?: (room: any) => void
  onError?: (error: any) => void
}

interface UseWebSocketReturn {
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'failed'
  sendMessage: (content: string) => void
  joinRoom: (roomId: string) => void
  leaveRoom: (roomId: string) => void
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { roomId, onMessage, onRoomCreated, onError } = options
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'failed'>('disconnected')
  const currentRoomRef = useRef<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setConnectionStatus('disconnected')
      return
    }

    let isActive = true // クリーンアップフラグ
    
    // 接続状態の監視を設定
    const handleConnectionStateChange = (state: ConnectionState) => {
      if (!isActive) return // クリーンアップ後は状態更新しない
      
      switch (state) {
        case ConnectionState.CONNECTING:
          setConnectionStatus('connecting')
          break
        case ConnectionState.CONNECTED:
          setConnectionStatus('connected')
          break
        case ConnectionState.DISCONNECTED:
          setConnectionStatus('disconnected')
          break
        case ConnectionState.FAILED:
          setConnectionStatus('failed')
          break
        default:
          setConnectionStatus('disconnected')
      }
    }

    // メッセージハンドラー
    const handleMessage = (message: WsMessage) => {
      if (!isActive) return // クリーンアップ後は処理しない
      
      switch (message.type) {
        case 'room_joined':
          // room_joinedメッセージを受信時の処理
          console.log('Successfully joined room:', message.room)
          break
        case 'message':
          if (onMessage) {
            // Convert WS message to Message format
            const msg: Message = {
              id: message.id,
              room_id: message.room,
              author_id: message.user_id,
              author_name: message.username,
              content: message.content,
              message_type: message.message_type as any,
              created_at: message.timestamp
            }
            onMessage(msg)
          }
          break
        case 'user_joined':
        case 'user_left':
          // Handle user join/leave events if needed
          console.log(`User ${message.username} ${message.type.split('_')[1]} room ${message.room}`)
          break
        case 'error':
          console.error('WebSocket error:', message.message)
          if (onError) {
            onError(new Error(message.message))
          }
          break
        case 'auth_required':
          console.warn('WebSocket authentication required')
          if (isActive) {
            setConnectionStatus('failed')
            if (onError) {
              onError(new Error('Authentication required'))
            }
          }
          break
        case 'rate_limited':
          console.warn('WebSocket rate limited, retry after:', message.retry_after)
          break
        default:
          console.log('Unknown message type:', message)
      }
    }

    const unsubscribeStateChange = wsService.onConnectionStateChange(handleConnectionStateChange)
    const unsubscribeMessage = wsService.onMessage(handleMessage)
    
    // 既に接続されている場合は新たに接続しない
    if (!wsService.isConnected()) {
      setConnectionStatus('connecting')
      wsService.connect(token).catch((error: Error) => {
        if (isActive) {
          console.error('WebSocket connection failed:', error)
          setConnectionStatus('failed')
          if (onError) {
            onError(error)
          }
        }
      })
    } else {
      // 既に接続済みの場合は状態を同期
      setConnectionStatus('connected')
    }

    return () => {
      isActive = false // フラグでクリーンアップ状態をマーク
      // ハンドラーの登録解除
      unsubscribeStateChange()
      unsubscribeMessage()
      setConnectionStatus('disconnected')
    }
  }, []) // 依存関係を空配列にしてマウント時のみ実行

  // onMessage, onErrorのハンドラーを登録（依存関係の変更があっても再接続しない）
  useEffect(() => {
    const handleMessage = (message: WsMessage) => {
      switch (message.type) {
        case 'message':
          if (onMessage) {
            const msg: Message = {
              id: message.id,
              room_id: message.room,
              author_id: message.user_id,
              author_name: message.username,
              content: message.content,
              message_type: message.message_type as any,
              created_at: message.timestamp
            }
            onMessage(msg)
          }
          break
        case 'error':
          if (onError) {
            onError(new Error(message.message))
          }
          break
      }
    }

    const unsubscribeCallback = wsService.onMessage(handleMessage)
    
    return () => {
      unsubscribeCallback() // ハンドラーの登録解除
    }
  }, [onMessage, onError]) // コールバックが変更された時のみ再登録

  useEffect(() => {
    if (roomId && connectionStatus === 'connected' && currentRoomRef.current !== roomId) {
      if (currentRoomRef.current) {
        wsService.leaveRoom(currentRoomRef.current)
      }
      wsService.joinRoom(roomId)
      currentRoomRef.current = roomId
    }
  }, [roomId, connectionStatus])

  const sendMessage = (content: string) => {
    if (roomId && connectionStatus === 'connected') {
      wsService.sendChatMessage(roomId, content)
    }
  }

  const joinRoom = (newRoomId: string) => {
    if (currentRoomRef.current) {
      wsService.leaveRoom(currentRoomRef.current)
    }
    wsService.joinRoom(newRoomId)
    currentRoomRef.current = newRoomId
  }

  const leaveRoom = (roomIdToLeave: string) => {
    wsService.leaveRoom(roomIdToLeave)
    if (currentRoomRef.current === roomIdToLeave) {
      currentRoomRef.current = null
    }
  }

  return {
    connectionStatus,
    sendMessage,
    joinRoom,
    leaveRoom
  }
}
