import { useState, useEffect, useCallback } from 'react'
import { api } from '../../services/api'
import type { OnlineUser } from '../../types'

interface OnlineUsersListProps {
  isVisible: boolean
  onClose: () => void
}

export default function OnlineUsersList({ isVisible, onClose }: OnlineUsersListProps) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadOnlineUsers = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await api.getOnlineUsers()
      setOnlineUsers(response.users)
      setLastUpdated(new Date())
    } catch (error) {
      console.error('Failed to load online users:', error)
      setOnlineUsers([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isVisible) {
      loadOnlineUsers()
      
      // 30秒ごとに自動更新（パフォーマンス配慮）
      const interval = setInterval(loadOnlineUsers, 30000)
      
      return () => clearInterval(interval)
    }
  }, [isVisible, loadOnlineUsers])

  if (!isVisible) {
    return null
  }

  const formatConnectedTime = (connectedAt: string) => {
    const connected = new Date(connectedAt)
    const now = new Date()
    const diffMs = now.getTime() - connected.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    
    if (diffMins < 1) return '今'
    if (diffMins < 60) return `${diffMins}分前`
    
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}時間前`
    
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}日前`
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'var(--background0)',
        border: '1px solid var(--background2)',
        borderRadius: '8px',
        padding: '1.5rem',
        minWidth: '400px',
        maxWidth: '600px',
        maxHeight: '70vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* ヘッダー */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          borderBottom: '1px solid var(--background2)',
          paddingBottom: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ 
              fontWeight: 'bold', 
              fontSize: '1rem',
              fontFamily: 'var(--font-mono)'
            }}>
              オンラインユーザー ({onlineUsers.length})
            </span>
            {lastUpdated && (
              <span style={{
                fontSize: '0.7rem',
                color: 'var(--foreground2)',
                fontFamily: 'var(--font-mono)'
              }}>
                更新: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={loadOnlineUsers}
              disabled={isLoading}
              style={{
                fontSize: '0.7rem',
                padding: '0.2rem 0.5rem',
                backgroundColor: 'transparent',
                color: 'var(--foreground1)',
                border: '1px solid var(--background2)',
                borderRadius: '3px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-mono)'
              }}
            >
              {isLoading ? '更新中...' : '更新'}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.2rem',
                cursor: 'pointer',
                color: 'var(--foreground1)'
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* コンテンツ */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading && onlineUsers.length === 0 ? (
            <div style={{
              textAlign: 'center',
              color: 'var(--foreground1)',
              padding: '2rem'
            }}>
              読み込み中...
            </div>
          ) : onlineUsers.length === 0 ? (
            <div style={{
              textAlign: 'center',
              color: 'var(--foreground1)',
              padding: '2rem'
            }}>
              オンラインユーザーがいません
            </div>
          ) : (
            <div>
              {onlineUsers.map(user => (
                <div
                  key={user.user_id}
                  style={{
                    padding: '0.75rem',
                    marginBottom: '0.25rem',
                    backgroundColor: 'var(--background1)',
                    borderRadius: '4px',
                    border: '1px solid var(--background2)'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.25rem'
                  }}>
                    <span style={{
                      fontWeight: 'bold',
                      fontSize: '0.9rem',
                      color: 'var(--success)'
                    }}>
                      ● {user.username}
                    </span>
                    <span style={{
                      fontSize: '0.7rem',
                      color: 'var(--foreground2)',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {formatConnectedTime(user.connected_at)}
                    </span>
                  </div>
                  
                  {user.connected_rooms.length > 0 && (
                    <div style={{
                      fontSize: '0.7rem',
                      color: 'var(--foreground2)',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      参加中: {user.connected_rooms.map(room => `#${room}`).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* フッター */}
        <div style={{
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid var(--background2)',
          fontSize: '0.7rem',
          color: 'var(--foreground2)',
          textAlign: 'center'
        }}>
          30秒ごとに自動更新されます
        </div>
      </div>
    </div>
  )
}