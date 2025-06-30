import { useState, useCallback, useEffect } from 'react'
import { FaUsers, FaLock, FaWifi, FaSearch } from 'react-icons/fa'
import { useAuth } from '../contexts/AuthContext'
import { useWebSocket } from '../hooks/useWebSocket'
import { api } from '../services/api'
import MessageInput from '../components/chat/MessageInput'
import MessageList from '../components/chat/MessageList'
import RoomList from '../components/chat/RoomList'
import MemberList from '../components/chat/MemberList'
import { SearchModal } from '../components/chat/SearchModal'
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
    const [showSearchModal, setShowSearchModal] = useState(false)

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

    // 初期のgeneralルームのメッセージをロード
    useEffect(() => {
        if (selectedRoom && selectedRoom.name === 'general') {
            loadInitialMessages(selectedRoom)
        }
    }, [selectedRoom])

    const loadInitialMessages = async (room: Room) => {
        console.log('🔄 Loading initial messages for room:', room.name)
        setIsLoadingMessages(true)
        try {
            const response = await api.getMessages(room.name, 50)
            console.log('✅ API response received:', response)
            console.log('📝 Messages count:', response.messages?.length || 0)
            console.log('📋 Messages data:', response.messages)
            setMessages(response.messages)
        } catch (error: any) {
            console.error('❌ Failed to load initial messages:', error)
            console.error('❌ Error details:', error.response?.data || error.message)
            setMessages([])
        } finally {
            setIsLoadingMessages(false)
        }
    }

    const handleRoomSelect = async (room: Room) => {
        console.log('🚪 Room select triggered:', room.name, room.id)
        
        if (selectedRoom) {
            console.log('👋 Leaving current room:', selectedRoom.name)
            await leaveRoom(selectedRoom.id)
        }
        
        setSelectedRoom(room)
        setMessages([]) // Clear messages when switching rooms
        setIsLoadingMessages(true)
        
        try {
            console.log('🔄 Loading messages for selected room:', room.name)
            // Load messages from API
            const response = await api.getMessages(room.name, 50)
            console.log('✅ Room select API response:', response)
            console.log('📝 Room select messages count:', response.messages?.length || 0)
            setMessages(response.messages)
        } catch (error: any) {
            console.error('❌ Failed to load messages for room:', error)
            console.error('❌ Room select error details:', error.response?.data || error.message)
            // エラー時は空のメッセージ配列のまま
        } finally {
            setIsLoadingMessages(false)
        }
        
        console.log('🔗 Joining room via WebSocket:', room.id)
        await joinRoom(room.id)
    }

    const handleSendMessage = (content: string) => {
        if (selectedRoom && user) {
            // WebSocketで送信（楽観的更新は削除してサーバーからの応答を待つ）
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
            {/* メインエリア */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
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
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {selectedRoom ? (
                    <>
                        {/* ヘッダー */}
                        <div is-="row" align-="between center" pad-="1" style={{ 
                            borderBottom: '1px solid var(--background2)', 
                            backgroundColor: 'var(--background1)',
                            padding: '0.5rem 1rem',
                            minHeight: '3rem'
                        }}>
                            {/* 左側: チャンネル情報と説明 */}
                            <div is-="row" align-="center" gap-="2" style={{ flex: 1, minWidth: 0 }}>
                                <div is-="row" align-="center" gap-="0.5">
                                    <span style={{ 
                                        fontWeight: 'bold', 
                                        fontSize: '1rem',
                                        fontFamily: 'var(--font-mono)'
                                    }}>
                                        #{selectedRoom.name}
                                    </span>
                                    {selectedRoom.is_public === false && (
                                        <FaLock 
                                            size={12} 
                                            style={{ color: 'var(--warning)' }}
                                            title="Private Channel"
                                        />
                                    )}
                                </div>
                                
                                {selectedRoom.description && (
                                    <span style={{ 
                                        fontSize: '0.8rem', 
                                        color: 'var(--foreground1)',
                                        maxWidth: '300px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        — {selectedRoom.description}
                                    </span>
                                )}
                            </div>

                            {/* 右側: 接続状態とメンバーボタン */}
                            <div style={{
                                display: 'flex',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}>
                                {connectionStatus === 'connected' ? (
                                    <FaWifi 
                                        size={12} 
                                        style={{ color: 'var(--success)' }}
                                        title="Connected"
                                    />
                                ) : (
                                    <span 
                                        style={{ 
                                            fontSize: '12px',
                                            color: 'var(--warning)'
                                        }}
                                        title={connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
                                    >
                                        ⚠
                                    </span>
                                )}
                                
                                <button
                                    onClick={() => setShowSearchModal(true)}
                                    is-="button"
                                    size-="small"
                                    variant-="background2"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        fontSize: '0.7rem'
                                    }}
                                    title="検索"
                                >
                                    <FaSearch size={10} />
                                </button>

                                {selectedRoom.is_public === false && (
                                    <button
                                        onClick={() => setShowMemberList(true)}
                                        is-="button"
                                        size-="small"
                                        variant-="background2"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            fontSize: '0.7rem'
                                        }}
                                        title="メンバー"
                                    >
                                        <FaUsers size={10} />
                                    </button>
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

                {/* 検索モーダル */}
                <SearchModal
                    isVisible={showSearchModal}
                    onClose={() => setShowSearchModal(false)}
                    currentRoom={selectedRoom?.name}
                />
            </div>
        </div>
    )
}
