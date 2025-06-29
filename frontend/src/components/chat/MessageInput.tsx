import { useState, useRef, useEffect } from 'react'

interface MessageInputProps {
  onSendMessage: (content: string) => void
  disabled?: boolean
  placeholder?: string
  roomName?: string
}

export default function MessageInput({ 
  onSendMessage, 
  disabled = false, 
  placeholder,
  roomName 
}: MessageInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const defaultPlaceholder = roomName 
    ? `#${roomName}にメッセージを送信...`
    : 'メッセージを入力...'

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [message])

  const handleSend = () => {
    const content = message.trim()
    if (content && !disabled) {
      onSendMessage(content)
      setMessage('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter で改行
        return
      } else {
        // Enter で送信
        e.preventDefault()
        handleSend()
      }
    }
  }

  return (
    <div is-="row" gap-="1" pad-="1" style={{ 
      borderTop: '1px solid var(--background2)',
      backgroundColor: 'var(--background0)'
    }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || defaultPlaceholder}
          disabled={disabled}
          rows={1}
          style={{
            width: '100%',
            minHeight: '2.5rem',
            maxHeight: '8rem',
            resize: 'none',
            border: '1px solid var(--background2)',
            borderRadius: '4px',
            padding: '0.5rem',
            fontSize: '0.9rem',
            fontFamily: 'var(--font-family)',
            backgroundColor: 'var(--background1)',
            color: 'var(--foreground0)',
            overflow: 'hidden'
          }}
        />
        
        {/* ヘルプテキスト */}
        <div style={{ 
          position: 'absolute',
          right: '0.5rem',
          bottom: '0.25rem',
          fontSize: '0.7rem',
          color: 'var(--foreground2)',
          pointerEvents: 'none',
          fontFamily: 'var(--font-mono)'
        }}>
          {message.length > 0 && (
            <span>Enter: 送信 | Shift+Enter: 改行</span>
          )}
        </div>
      </div>
      
      <button
        onClick={handleSend}
        disabled={disabled || !message.trim()}
        variant-="primary"
        style={{
          alignSelf: 'flex-end',
          minWidth: '4rem',
          height: '2.5rem'
        }}
      >
        送信
      </button>
    </div>
  )
}
