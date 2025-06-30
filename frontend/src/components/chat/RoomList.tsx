import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import type { Room } from '../../types'

interface RoomListProps {
  selectedRoom: Room | null
  onRoomSelect: (room: Room) => void
  onRoomCreate?: (room: Room) => void
}

export default function RoomList({ selectedRoom, onRoomSelect, onRoomCreate }: RoomListProps) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomDescription, setNewRoomDescription] = useState('')
  const [newRoomIsPublic, setNewRoomIsPublic] = useState(true) // デフォルトはパブリック
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    loadRooms()
  }, [])

  const loadRooms = async () => {
    try {
      setIsLoading(true)
      const response = await api.getRooms()
      setRooms(response.rooms)
    } catch (error) {
      console.error('Failed to load rooms:', error)
      // エラー時は空のルーム配列
      setRooms([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return

    try {
      setCreateError(null) // エラーをクリア
      
      // Call the real API to create the room
      const response = await api.createRoom(
        newRoomName.trim(),
        newRoomDescription.trim() || undefined,
        newRoomIsPublic
      )
      
      // Convert API response to Room type
      const newRoom: Room = {
        id: response.id,
        name: response.name,
        description: response.description,
        is_public: response.is_public,
        created_at: response.created_at
      }
      
      setRooms(prev => [...prev, newRoom])
      setShowCreateForm(false)
      setNewRoomName('')
      setNewRoomDescription('')
      setNewRoomIsPublic(true)
      setCreateError(null)
      
      if (onRoomCreate) {
        onRoomCreate(newRoom)
      }
    } catch (error: any) {
      console.error('Failed to create room:', error)
      if (error.response?.status === 409) {
        setCreateError(`チャンネル名 "${newRoomName}" は既に使用されています`)
      } else if (error.response?.status === 400) {
        setCreateError('チャンネル名が無効です')
      } else {
        setCreateError('チャンネルの作成に失敗しました')
      }
    }
  }

  if (isLoading) {
    return (
      <div is-="column" align-="center" pad-="2">
        <span style={{ fontSize: '0.8rem', color: 'var(--foreground1)' }}>読み込み中...</span>
      </div>
    )
  }

  return (
    <div is-="column" gap-="0" style={{ height: '100%' }}>
      {/* ヘッダー */}
      <div is-="row" align-="between center" pad-="1" style={{ borderBottom: '1px solid var(--background2)' }}>
        <span style={{ fontWeight: 'bold', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
          CHANNELS
        </span>
        <button
          onClick={() => setShowCreateForm(true)}
          size-="small"
          variant-="ghost"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '1.8rem',
            height: '1.8rem',
            fontSize: '1rem'
          }}
          title="チャンネル作成"
        >
          +
        </button>
      </div>

      {/* ルーム一覧 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        {rooms.length === 0 ? (
          <div is-="column" align-="center center" style={{ padding: '2rem' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--foreground1)' }}>チャンネルがありません</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--foreground2)' }}>新しいチャンネルを作成してみましょう！</span>
          </div>
        ) : (
          rooms.map(room => (
            <div
              key={room.id}
              onClick={() => onRoomSelect(room)}
              style={{
                padding: '0.5rem 1rem',
                cursor: 'pointer',
                backgroundColor: selectedRoom?.id === room.id ? 'var(--background2)' : 'transparent',
                borderRadius: '4px',
                marginBottom: '0.25rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
                  #{room.name}
                </span>
                {room.is_public === false && (
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
            </div>
          ))
        )}
        </div>

        {/* ルーム作成フォーム */}
      {showCreateForm && (
        <div is-="column" gap-="1" pad-="1" style={{ borderBottom: '1px solid var(--background2)', backgroundColor: 'var(--background1)' }}>
          <input
            type="text"
            value={newRoomName}
            onChange={(e) => {
              setNewRoomName(e.target.value)
              setCreateError(null) // 入力時にエラーをクリア
            }}
            placeholder="チャンネル名"
            style={{ fontSize: '0.8rem' }}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateRoom()}
          />
          <input
            type="text"
            value={newRoomDescription}
            onChange={(e) => setNewRoomDescription(e.target.value)}
            placeholder="説明 (任意)"
            style={{ fontSize: '0.8rem' }}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateRoom()}
          />
          
          {/* パブリック/プライベート選択 */}
          <div is-="column" gap-="0.5">
            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--foreground1)' }}>
              チャンネルタイプ
            </span>
            <div is-="column" gap-="0.25">
              <label style={{ fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  name="roomType"
                  checked={newRoomIsPublic}
                  onChange={() => setNewRoomIsPublic(true)}
                  style={{ margin: 0 }}
                />
                <span>パブリック - 誰でも参加可能</span>
              </label>
              <label style={{ fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  name="roomType"
                  checked={!newRoomIsPublic}
                  onChange={() => setNewRoomIsPublic(false)}
                  style={{ margin: 0 }}
                />
                <span>プライベート - 招待制</span>
              </label>
            </div>
          </div>

          {/* エラーメッセージ */}
          {createError && (
            <div style={{
              backgroundColor: 'var(--danger)',
              color: 'var(--background0)',
              padding: '0.5rem',
              borderRadius: '4px',
              fontSize: '0.8rem',
              marginBottom: '0.5rem'
            }}>
              {createError}
            </div>
          )}

          <div is-="row" gap-="1">
            <button
              onClick={handleCreateRoom}
              size-="small"
              variant-="primary"
              disabled={!newRoomName.trim()}
              style={{ fontSize: '0.8rem' }}
            >
              作成
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false)
                setNewRoomName('')
                setNewRoomDescription('')
                setNewRoomIsPublic(true)
                setCreateError(null)
              }}
              size-="small"
              variant-="ghost"
              style={{ fontSize: '0.8rem' }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
