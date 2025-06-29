import { useEffect, useRef, useState } from 'react'
import { wsService } from '../services/websocket'
import type { Message, WsMessage } from '../types'

interface UseWebSocketOptions {
  roomId?: string
  onMessage?: (message: Message) => void
  onRoomCreated?: (room: any) => void
  onError?: (error: any) => void
}

interface UseWebSocketReturn {
  connectionStatus: 'connecting' | 'connected' | 'disconnected'
  sendMessage: (content: string) => void
  joinRoom: (roomId: string) => void
  leaveRoom: (roomId: string) => void
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { roomId, onMessage, onRoomCreated, onError } = options
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected')
  const currentRoomRef = useRef<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setConnectionStatus('disconnected')
      return
    }

    setConnectionStatus('connecting')
    
    wsService.connect(token)
    
    wsService.onMessage((message: WsMessage) => {
      switch (message.type) {
        case 'room_joined':
          setConnectionStatus('connected')
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
          setConnectionStatus('disconnected')
          if (onError) {
            onError(new Error(message.message))
          }
          break
        default:
          console.log('Unknown message type:', message)
      }
    })

    return () => {
      wsService.disconnect()
      setConnectionStatus('disconnected')
    }
  }, [onMessage, onRoomCreated, onError])

  useEffect(() => {
    if (roomId && connectionStatus === 'connected' && currentRoomRef.current !== roomId) {
      if (currentRoomRef.current) {
        wsService.leaveRoom(currentRoomRef.current)
      }
      const token = localStorage.getItem('token')
      if (token) {
        wsService.joinRoom(roomId, token)
        currentRoomRef.current = roomId
      }
    }
  }, [roomId, connectionStatus])

  const sendMessage = (content: string) => {
    if (roomId && connectionStatus === 'connected') {
      wsService.sendMessage(roomId, content)
    }
  }

  const joinRoom = (newRoomId: string) => {
    if (currentRoomRef.current) {
      wsService.leaveRoom(currentRoomRef.current)
    }
    const token = localStorage.getItem('token')
    if (token) {
      wsService.joinRoom(newRoomId, token)
      currentRoomRef.current = newRoomId
    }
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
