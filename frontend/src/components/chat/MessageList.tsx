import { useEffect, useRef } from 'react'
import type { Message } from '../../types'

interface MessageListProps {
  messages: Message[]
  isLoading?: boolean
}

export default function MessageList({ messages, isLoading = false }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return '今日'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return '昨日'
    } else {
      return date.toLocaleDateString('ja-JP', {
        month: 'short',
        day: 'numeric'
      })
    }
  }

  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { [date: string]: Message[] } = {}
    
    messages.forEach(message => {
      const date = new Date(message.created_at).toDateString()
      if (!groups[date]) {
        groups[date] = []
      }
      groups[date].push(message)
    })

    return Object.entries(groups).map(([date, msgs]) => ({
      date,
      messages: msgs
    }))
  }

  if (isLoading) {
    return (
      <div is-="column" align-="center center" style={{ flex: 1, padding: '2rem' }}>
        <span style={{ fontSize: '0.9rem', color: 'var(--foreground1)' }}>メッセージを読み込み中...</span>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div is-="column" align-="center center" style={{ flex: 1, padding: '2rem' }}>
        <span style={{ fontSize: '0.9rem', color: 'var(--foreground1)' }}>まだメッセージがありません</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--foreground2)' }}>最初のメッセージを送信してみましょう！</span>
      </div>
    )
  }

  const messageGroups = groupMessagesByDate(messages)

  return (
    <div 
      className="message-list-container"
      style={{ 
        flex: 1, 
        overflow: 'auto', 
        padding: '1rem',
        scrollBehavior: 'smooth',
        minHeight: 0 // Flexboxでスクロールを有効にするために必要
      }}>
      <div is-="column" gap-="2">
        {messageGroups.map(({ date, messages: dayMessages }) => (
          <div key={date} is-="column" gap-="1">
            {/* 日付セパレーター */}
            <div is-="row" align-="center" gap-="2" style={{ margin: '1rem 0 0.5rem 0' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--background2)' }} />
              <span style={{ 
                fontSize: '0.7rem', 
                color: 'var(--foreground2)', 
                backgroundColor: 'var(--background0)',
                padding: '0.25rem 0.5rem',
                fontWeight: 'bold'
              }}>
                {formatDate(date)}
              </span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--background2)' }} />
            </div>

            {/* その日のメッセージ */}
            {dayMessages.map((message, index) => {
              const prevMessage = index > 0 ? dayMessages[index - 1] : null
              const showAvatar = !prevMessage || prevMessage.author_id !== message.author_id

              return (
                <div key={message.id} is-="row" gap-="2" align-="start" style={{ 
                  marginTop: showAvatar ? '0.5rem' : '0.1rem'
                }}>
                  {/* アバター */}
                  <div style={{ width: '2rem', display: 'flex', justifyContent: 'center' }}>
                    {showAvatar && (
                      <div style={{
                        width: '2rem',
                        height: '2rem',
                        borderRadius: '4px',
                        backgroundColor: 'var(--background2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        color: 'var(--foreground0)'
                      }}>
                        {/* {message.author_name.charAt(0).toUpperCase()} */}
                        {message.author_name ?
                          message.author_name.charAt(0).toUpperCase() :
                          '?'
                        }
                      </div>
                    )}
                  </div>

                  {/* メッセージ内容 */}
                  <div is-="column" gap-="0" style={{ flex: 1, minWidth: 0 }}>
                    {showAvatar && (
                      <div is-="row" gap-="1" align-="center" style={{ marginBottom: '0.2rem' }}>
                        <span style={{ 
                          fontWeight: 'bold', 
                          fontSize: '0.9rem',
                          color: 'var(--foreground0)'
                        }}>
                          {message.author_name}
                        </span>
                        <span style={{ 
                          fontSize: '0.7rem', 
                          color: 'var(--foreground2)',
                          fontFamily: 'var(--font-mono)'
                        }}>
                          {formatTime(message.created_at)}
                        </span>
                      </div>
                    )}
                    <div style={{ 
                      fontSize: '0.9rem', 
                      lineHeight: '1.4',
                      color: 'var(--foreground0)',
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {message.content}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div ref={messagesEndRef} />
    </div>
  )
}
