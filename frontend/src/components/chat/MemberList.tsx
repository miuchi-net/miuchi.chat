import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import type { Room, RoomMember } from '../../types'

interface MemberListProps {
  room: Room | null
  isVisible: boolean
  onClose: () => void
}

export default function MemberList({ room, isVisible, onClose }: MemberListProps) {
  const [members, setMembers] = useState<RoomMember[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [isInviting, setIsInviting] = useState(false)

  useEffect(() => {
    if (isVisible && room) {
      loadMembers()
    }
  }, [isVisible, room])

  const loadMembers = async () => {
    if (!room) return

    try {
      setIsLoading(true)
      const response = await api.getRoomMembers(room.name)
      setMembers(response.members)
    } catch (error) {
      console.error('Failed to load members:', error)
      // パブリックルームの場合はメンバー情報がないことを示す
      if (room.is_public) {
        setMembers([])
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleInvite = async () => {
    if (!room || !inviteUsername.trim()) return

    try {
      setIsInviting(true)
      setInviteError(null)
      setInviteSuccess(null)
      
      const response = await api.inviteUser(room.name, inviteUsername.trim())
      
      if (response.success) {
        setInviteSuccess(response.message)
        setInviteUsername('')
        setShowInviteForm(false)
        // メンバー一覧を再読み込み
        setTimeout(() => {
          loadMembers()
        }, 500)
      } else {
        setInviteError(response.message)
      }
    } catch (error: any) {
      console.error('Failed to invite user:', error)
      if (error.response?.status === 404) {
        setInviteError('ユーザーが見つかりません')
      } else if (error.response?.status === 403) {
        setInviteError('招待する権限がありません')
      } else {
        setInviteError('招待に失敗しました')
      }
    } finally {
      setIsInviting(false)
    }
  }

  const resetInviteForm = () => {
    setShowInviteForm(false)
    setInviteUsername('')
    setInviteError(null)
    setInviteSuccess(null)
  }

  if (!isVisible || !room) {
    return null
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
        minWidth: '300px',
        maxWidth: '500px',
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
          <span style={{ 
            fontWeight: 'bold', 
            fontSize: '1rem',
            fontFamily: 'var(--font-mono)'
          }}>
            #{room.name} メンバー
          </span>
          <button
            onClick={() => {
              resetInviteForm()
              onClose()
            }}
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

        {/* コンテンツ */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {room.is_public ? (
            <div style={{
              textAlign: 'center',
              color: 'var(--foreground1)',
              padding: '2rem'
            }}>
              <span style={{ fontSize: '0.9rem' }}>
                パブリックチャンネルでは<br />
                メンバー管理は行われません
              </span>
            </div>
          ) : isLoading ? (
            <div style={{
              textAlign: 'center',
              color: 'var(--foreground1)',
              padding: '2rem'
            }}>
              読み込み中...
            </div>
          ) : members.length === 0 ? (
            <div style={{
              textAlign: 'center',
              color: 'var(--foreground1)',
              padding: '2rem'
            }}>
              メンバーがいません
            </div>
          ) : (
            <div>
              <span style={{
                fontSize: '0.8rem',
                color: 'var(--foreground2)',
                marginBottom: '0.5rem',
                display: 'block'
              }}>
                {members.length}人のメンバー
              </span>
              {members.map(member => (
                <div
                  key={member.user_id}
                  style={{
                    padding: '0.5rem',
                    marginBottom: '0.25rem',
                    backgroundColor: 'var(--background1)',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span style={{
                    fontWeight: 'bold',
                    fontSize: '0.9rem'
                  }}>
                    {member.username}
                  </span>
                  <span style={{
                    fontSize: '0.7rem',
                    color: 'var(--foreground2)',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {new Date(member.joined_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 成功・エラーメッセージ */}
        {(inviteSuccess || inviteError) && (
          <div style={{
            padding: '0.5rem',
            borderRadius: '4px',
            fontSize: '0.8rem',
            marginBottom: '1rem',
            backgroundColor: inviteSuccess ? 'var(--success)' : 'var(--danger)',
            color: 'var(--background0)'
          }}>
            {inviteSuccess || inviteError}
          </div>
        )}

        {/* プライベートルームの場合、招待機能を表示 */}
        {!room.is_public && (
          <div style={{
            marginTop: '1rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--background2)'
          }}>
            {!showInviteForm ? (
              <button
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--background0)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
                onClick={() => setShowInviteForm(true)}
              >
                メンバーを招待
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(e) => {
                    setInviteUsername(e.target.value)
                    setInviteError(null)
                  }}
                  placeholder="ユーザー名を入力"
                  style={{
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid var(--background2)',
                    fontSize: '0.8rem',
                    backgroundColor: 'var(--background1)'
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && handleInvite()}
                />
                
                {inviteError && (
                  <div style={{
                    color: 'var(--danger)',
                    fontSize: '0.7rem'
                  }}>
                    {inviteError}
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleInvite}
                    disabled={isInviting || !inviteUsername.trim()}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      backgroundColor: isInviting ? 'var(--background2)' : 'var(--primary)',
                      color: 'var(--background0)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: isInviting ? 'not-allowed' : 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    {isInviting ? '招待中...' : '招待'}
                  </button>
                  <button
                    onClick={resetInviteForm}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: 'transparent',
                      color: 'var(--foreground1)',
                      border: '1px solid var(--background2)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}