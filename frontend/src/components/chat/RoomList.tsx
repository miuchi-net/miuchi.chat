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

  useEffect(() => {
    loadRooms()
  }, [])

  const loadRooms = async () => {
    try {
      setIsLoading(true)
      // For now, use mock data since we don't have backend implemented yet
      const mockRooms: Room[] = [
        { id: '1', name: 'general', description: '一般的な話題' },
        { id: '2', name: 'tech', description: '技術的な話題' },
        { id: '3', name: 'random', description: 'その他の話題' }
      ]
      setRooms(mockRooms)
      
      // When backend is ready, use:
      // const response = await api.getRooms()
      // setRooms(response.rooms)
    } catch (error) {
      console.error('Failed to load rooms:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return

    try {
      // For now, create a mock room
      const newRoom: Room = {
        id: Date.now().toString(),
        name: newRoomName.trim(),
        description: newRoomDescription.trim() || undefined,
        created_at: new Date().toISOString()
      }
      
      setRooms(prev => [...prev, newRoom])
      setShowCreateForm(false)
      setNewRoomName('')
      setNewRoomDescription('')
      
      if (onRoomCreate) {
        onRoomCreate(newRoom)
      }
      
      // When backend is ready, use:
      // const response = await api.createRoom({ name: newRoomName, description: newRoomDescription })
      // setRooms(prev => [...prev, response])
      // if (onRoomCreate) onRoomCreate(response)
    } catch (error) {
      console.error('Failed to create room:', error)
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
              <span style={{ fontWeight: 'bold', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>
                #{room.name}
              </span>
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
            onChange={(e) => setNewRoomName(e.target.value)}
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
