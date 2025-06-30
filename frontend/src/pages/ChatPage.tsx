import { useState, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useWebSocket } from '../hooks/useWebSocket'
import MessageInput from '../components/chat/MessageInput'
import MessageList from '../components/chat/MessageList'
import RoomList from '../components/chat/RoomList'
import MemberList from '../components/chat/MemberList'
import OnlineUsersList from '../components/chat/OnlineUsersList'
import type { Message, Room } from '../types'

export default function ChatPage() {
    const { user } = useAuth()
    // デフォルトでgeneralルームを選択
    const [selectedRoom, setSelectedRoom] = useState<Room | null>({
        id: '00000000-0000-0000-0000-000000000001',
        name: 'general',
        description: 'General discussion room',
        is_public: true
    })
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoadingMessages, setIsLoadingMessages] = useState(false)
    const [showMemberList, setShowMemberList] = useState(false)
    const [showOnlineUsers, setShowOnlineUsers] = useState(false)

    // useCallbackでコールバック関数を最適化
    const handleMessage = useCallback((message: Message) => {
        console.log('New message received:', message)
        setMessages(prev => [...prev, message])
    }, [])

    const handleError = useCallback((error: Error) => {
        console.error('WebSocket error:', error)
        
        // ルームが見つからないエラーの場合、ルーム選択をクリア
        if (error.message === 'Room not found' && selectedRoom) {
            console.warn(`Room "${selectedRoom.name}" not found, clearing selection`)
            setSelectedRoom(null)
            setMessages([])
        }
    }, [selectedRoom])

    const {
        connectionStatus,
        sendMessage: wsSendMessage,
        joinRoom,
        leaveRoom
    } = useWebSocket({
        roomId: selectedRoom?.id,
        onMessage: handleMessage,
        onError: handleError
    })

    const handleRoomSelect = async (room: Room) => {
        if (selectedRoom) {
            await leaveRoom(selectedRoom.id)
        }
        
        setSelectedRoom(room)
        setMessages([]) // Clear messages when switching rooms
        setIsLoadingMessages(true)
        
        try {
            // Load messages from API
            const response = await api.getMessages(room.name, 50)
            setMessages(response.messages)
        } catch (error) {
            console.error('Failed to load messages:', error)
            // エラー時は空のメッセージ配列のまま
        } finally {
            setIsLoadingMessages(false)
        }
        
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

    const handleRoomCreate = async (newRoom: Room) => {
        // Automatically join the newly created room
        await handleRoomSelect(newRoom)
    }

    if (!user) {
        return (
            <div is-="column" align-="center center" style={{ height: '100vh' }}>
                <span is-="badge" variant-="red">認証が必要です</span>
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
            {/* トップバー */}
            <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                padding: '0.5rem 1rem',
                borderBottom: '1px solid var(--background2)',
                backgroundColor: 'var(--background1)',
                minHeight: '3rem'
            }}>
                <button
                    onClick={() => setShowOnlineUsers(true)}
                    style={{
                        fontSize: '0.8rem',
                        padding: '0.4rem 0.8rem',
                        backgroundColor: 'transparent',
                        color: 'var(--foreground1)',
                        border: '1px solid var(--background2)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                >
                    <span style={{ color: 'var(--success)' }}>●</span>
                    オンライン
                </button>
            </div>

            {/* メインエリア */}
            <div style={{ display: 'flex', flex: 1 }}>
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
                                    <div style={{ 
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem'
                                    }}>
                                        <span style={{ 
                                            fontWeight: 'bold', 
                                            fontSize: '1rem',
                                            fontFamily: 'var(--font-mono)'
                                        }}>
                                            #{selectedRoom.name}
                                        </span>
                                        {selectedRoom.is_public === false && (
                                            <span style={{ 
                                                fontSize: '0.6rem', 
                                                color: 'var(--foreground2)',
                                                backgroundColor: 'var(--background2)',
                                                padding: '0.1rem 0.3rem',
                                                borderRadius: '2px',
                                                fontFamily: 'var(--font-mono)'
                                            }}>
                                                PRIVATE
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            color: connectionStatus === 'connected' ? 'var(--success)' : 'var(--warning)',
                                            fontFamily: 'var(--font-mono)'
                                        }}>
                                            {connectionStatus === 'connected' ? '● 接続済み' : 
                                             connectionStatus === 'connecting' ? '○ 接続中...' : '○ 未接続'}
                                        </span>
                                        {selectedRoom.is_public === false && (
                                            <button
                                                onClick={() => setShowMemberList(true)}
                                                style={{
                                                    fontSize: '0.7rem',
                                                    padding: '0.2rem 0.5rem',
                                                    backgroundColor: 'transparent',
                                                    color: 'var(--foreground1)',
                                                    border: '1px solid var(--background2)',
                                                    borderRadius: '3px',
                                                    cursor: 'pointer',
                                                    fontFamily: 'var(--font-mono)'
                                                }}
                                            >
                                                メンバー
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div is-="column" gap-="0.25">
                                    {selectedRoom.description && (
                                        <span style={{ 
                                            fontSize: '0.8rem', 
                                            color: 'var(--foreground1)'
                                        }}>
                                            {selectedRoom.description}
                                        </span>
                                    )}
                                    <span style={{ 
                                        fontSize: '0.7rem', 
                                        color: 'var(--foreground2)',
                                        fontFamily: 'var(--font-mono)'
                                    }}>
                                        {selectedRoom.is_public === false ? 'Private Channel' : 'Public Channel'}
                                    </span>
                                </div>

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

                {/* メンバー一覧モーダル */}
                <MemberList
                    room={selectedRoom}
                    isVisible={showMemberList}
                    onClose={() => setShowMemberList(false)}
                />

                {/* オンラインユーザー一覧モーダル */}
                <OnlineUsersList
                    isVisible={showOnlineUsers}
                    onClose={() => setShowOnlineUsers(false)}
                />
            </div>
        </div>
    )
}
