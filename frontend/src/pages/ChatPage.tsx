import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useWebSocket } from '../hooks/useWebSocket'
import MessageInput from '../components/chat/MessageInput'
import MessageList from '../components/chat/MessageList'
import RoomList from '../components/chat/RoomList'
import type { Message, Room } from '../types'

export default function ChatPage() {
    const { user } = useAuth()
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoadingMessages, setIsLoadingMessages] = useState(false)

    const {
        connectionStatus,
        sendMessage: wsSendMessage,
        joinRoom,
        leaveRoom
    } = useWebSocket({
        roomId: selectedRoom?.id,
        onMessage: (message) => {
            console.log('New message received:', message)
            setMessages(prev => [...prev, message])
        },
        onError: (error) => {
            console.error('WebSocket error:', error)
        }
    })

    const handleRoomSelect = async (room: Room) => {
        if (selectedRoom) {
            await leaveRoom(selectedRoom.id)
        }
        
        setSelectedRoom(room)
        setMessages([]) // Clear messages when switching rooms
        setIsLoadingMessages(true)
        
        // TODO: Load messages from API
        // const response = await api.getMessages(room.id, 50)
        // setMessages(response.messages)
        
        // Mock messages for now
        setTimeout(() => {
            const mockMessages: Message[] = [
                {
                    id: '1',
                    room_id: room.id,
                    author_id: '1',
                    author_name: 'システム',
                    content: `#${room.name} へようこそ！`,
                    created_at: new Date(Date.now() - 3600000).toISOString()
                },
                {
                    id: '2',
                    room_id: room.id,
                    author_id: '2',
                    author_name: 'ユーザー',
                    content: 'こんにちは！\nよろしくお願いします。',
                    created_at: new Date(Date.now() - 1800000).toISOString()
                }
            ]
            setMessages(mockMessages)
            setIsLoadingMessages(false)
        }, 500)
        
        await joinRoom(room.id)
    }

    const handleSendMessage = (content: string) => {
        if (selectedRoom && user) {
            // Optimistic update
            const tempMessage: Message = {
                id: `temp-${Date.now()}`,
                room_id: selectedRoom.id,
                author_id: user.id,
                author_name: user.username,
                content,
                created_at: new Date().toISOString()
            }
            setMessages(prev => [...prev, tempMessage])
            
            // Send via WebSocket
            wsSendMessage(content)
        }
    }

    const handleRoomCreate = (newRoom: Room) => {
        setSelectedRoom(newRoom)
    }

    if (!user) {
        return (
            <div is-="column" align-="center center" style={{ height: '100vh' }}>
                <span is-="badge" variant-="red">認証が必要です</span>
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
            {/* サイドバー */}
            <div style={{ 
                width: '280px', 
                borderRight: '1px solid var(--background2)', 
                backgroundColor: 'var(--background1)',
                display: 'flex',
                flexDirection: 'column',
                padding: '0.5rem'
            }}>
                <RoomList
                    selectedRoom={selectedRoom}
                    onRoomSelect={handleRoomSelect}
                    onRoomCreate={handleRoomCreate}
                />
            </div>

            {/* メインチャット */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {selectedRoom ? (
                    <>
                        {/* ヘッダー */}
                        <div is-="row" align-="between center" pad-="1" style={{ 
                            borderBottom: '1px solid var(--background2)', 
                            backgroundColor: 'var(--background1)',
                            padding: '0.5rem 1rem',
                            minHeight: '3rem'
                        }}>
                            <div is-="column" gap-="0">
                                <div is-="row" gap-="2" align-="center">
                                    <span style={{ 
                                        fontWeight: 'bold', 
                                        fontSize: '1rem',
                                        fontFamily: 'var(--font-mono)'
                                    }}>
                                        #{selectedRoom.name}
                                    </span>
                                    <span style={{
                                        fontSize: '0.7rem',
                                        color: connectionStatus === 'connected' ? 'var(--success)' : 'var(--warning)',
                                        fontFamily: 'var(--font-mono)',
                                        marginLeft: '0.5rem'
                                    }}>
                                        {connectionStatus === 'connected' ? '● 接続済み' : 
                                         connectionStatus === 'connecting' ? '○ 接続中...' : '○ 未接続'}
                                    </span>
                                </div>
                                {selectedRoom.description && (
                                    <span style={{ 
                                        fontSize: '0.8rem', 
                                        color: 'var(--foreground1)'
                                    }}>
                                        {selectedRoom.description}
                                    </span>
                                )}

                                {selectedRoom.created_at && (
                                    <span style={{ 
                                        fontSize: '0.7rem', 
                                        color: 'var(--foreground2)',
                                        fontFamily: 'var(--font-mono)'
                                    }}>
                                        Created at: {new Date(selectedRoom.created_at).toLocaleDateString()} {new Date(selectedRoom.created_at).toLocaleTimeString()}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* メッセージエリア */}
                        <MessageList 
                            messages={messages.filter(msg => msg.room_id === selectedRoom.id)}
                            isLoading={isLoadingMessages}
                        />

                        {/* 入力エリア */}
                        <MessageInput
                            onSendMessage={handleSendMessage}
                            disabled={connectionStatus !== 'connected'}
                            roomName={selectedRoom.name}
                        />
                    </>
                ) : (
                    <div is-="column" align-="center center" style={{ flex: 1 }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>チャンネルを選択してください</span>
                        <span style={{ fontSize: '0.9rem', color: 'var(--foreground1)' }}>
                            左側からチャンネルを選んでチャットを開始しましょう
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}
