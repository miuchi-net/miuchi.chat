import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import type { SearchResponse } from '../../types'

interface SearchModalProps {
    isVisible: boolean;
    onClose: () => void;
    currentRoom?: string;
}

export function SearchModal({ isVisible, onClose, currentRoom }: SearchModalProps) {
    const [query, setQuery] = useState('')
    const [searchResults, setSearchResults] = useState<SearchResponse | null>(null)
    const [isSearching, setIsSearching] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchInCurrentRoom, setSearchInCurrentRoom] = useState(true)

    // ESCキーでモーダルを閉じる
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isVisible) {
                onClose()
            }
        }

        if (isVisible) {
            document.addEventListener('keydown', handleEscape)
            return () => document.removeEventListener('keydown', handleEscape)
        }
    }, [isVisible, onClose])

    const handleSearch = async () => {
        if (!query.trim()) {
            setSearchResults(null)
            return
        }

        setIsSearching(true)
        setError(null)

        try {
            const roomFilter = searchInCurrentRoom ? currentRoom : undefined
            const results = await api.searchMessages(query.trim(), roomFilter)
            setSearchResults(results)
        } catch (err) {
            console.error('Search failed:', err)
            setError('検索に失敗しました')
            setSearchResults(null)
        } finally {
            setIsSearching(false)
        }
    }

    const handleClear = () => {
        setQuery('')
        setSearchResults(null)
        setError(null)
    }

    const handleClose = () => {
        handleClear()
        onClose()
    }

    if (!isVisible) return null

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
        }}
        onClick={(e) => {
            if (e.target === e.currentTarget) {
                handleClose()
            }
        }}>
            <div style={{
                backgroundColor: 'var(--background0)',
                border: '1px solid var(--background2)',
                borderRadius: '8px',
                padding: '1.5rem',
                width: '90%',
                maxWidth: '600px',
                maxHeight: '80vh',
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
                        メッセージ検索
                    </span>
                    <button
                        onClick={handleClose}
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

                {/* 検索フォーム */}
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="検索キーワードを入力..."
                            style={{
                                flex: 1,
                                padding: '0.5rem',
                                borderRadius: '4px',
                                border: '1px solid var(--background2)',
                                fontSize: '0.9rem',
                                backgroundColor: 'var(--background1)',
                                color: 'var(--foreground0)'
                            }}
                            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                            autoFocus
                        />
                        <button
                            onClick={handleSearch}
                            disabled={isSearching || !query.trim()}
                            style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: isSearching ? 'var(--background2)' : 'var(--primary)',
                                color: 'var(--background0)',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isSearching ? 'not-allowed' : 'pointer',
                                fontSize: '0.8rem'
                            }}
                        >
                            {isSearching ? '検索中...' : '検索'}
                        </button>
                        {query && (
                            <button
                                onClick={handleClear}
                                style={{
                                    padding: '0.5rem',
                                    backgroundColor: 'transparent',
                                    color: 'var(--foreground1)',
                                    border: '1px solid var(--background2)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem'
                                }}
                            >
                                クリア
                            </button>
                        )}
                    </div>
                    
                    {/* フィルター */}
                    {currentRoom && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <label style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.25rem',
                                fontSize: '0.8rem',
                                color: 'var(--foreground1)'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={searchInCurrentRoom}
                                    onChange={(e) => setSearchInCurrentRoom(e.target.checked)}
                                />
                                #{currentRoom} 内のみ検索
                            </label>
                        </div>
                    )}
                </div>

                {/* エラー表示 */}
                {error && (
                    <div style={{
                        padding: '0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        marginBottom: '1rem',
                        backgroundColor: 'var(--danger)',
                        color: 'var(--background0)'
                    }}>
                        {error}
                    </div>
                )}

                {/* 検索結果エリア */}
                <div style={{ 
                    flex: 1, 
                    overflowY: 'auto',
                    minHeight: '200px'
                }}>
                    {!query.trim() ? (
                        <div style={{
                            textAlign: 'center',
                            color: 'var(--foreground1)',
                            padding: '2rem',
                            fontSize: '0.9rem'
                        }}>
                            キーワードを入力して検索ボタンを押してください
                        </div>
                    ) : searchResults ? (
                        <>
                            {/* 結果のサマリー */}
                            <div style={{
                                marginBottom: '1rem',
                                padding: '0.5rem',
                                backgroundColor: 'var(--background1)',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                color: 'var(--foreground1)'
                            }}>
                                <strong>{searchResults.total_hits}</strong>件の結果 
                                ({searchResults.query_time_ms}ms)
                                {searchInCurrentRoom && currentRoom && (
                                    <span> - #{currentRoom} 内</span>
                                )}
                            </div>

                            {/* 結果リスト */}
                            {searchResults.results.length === 0 ? (
                                <div style={{
                                    textAlign: 'center',
                                    color: 'var(--foreground1)',
                                    padding: '2rem',
                                    fontSize: '0.9rem'
                                }}>
                                    検索結果が見つかりませんでした
                                </div>
                            ) : (
                                <div>
                                    {searchResults.results.map((result) => {
                                        const { message, highlights, score } = result
                                        const createdAt = new Date(message.created_at)
                                        
                                        return (
                                            <div 
                                                key={message.id} 
                                                style={{
                                                    padding: '0.75rem',
                                                    marginBottom: '0.5rem',
                                                    backgroundColor: 'var(--background1)',
                                                    border: '1px solid var(--background2)',
                                                    borderRadius: '4px'
                                                }}
                                            >
                                                {/* メッセージヘッダー */}
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    marginBottom: '0.5rem'
                                                }}>
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem'
                                                    }}>
                                                        <span style={{
                                                            fontWeight: 'bold',
                                                            fontSize: '0.8rem',
                                                            color: 'var(--primary)'
                                                        }}>
                                                            {message.author_name}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.7rem',
                                                            color: 'var(--foreground2)',
                                                            fontFamily: 'var(--font-mono)'
                                                        }}>
                                                            #{currentRoom || 'general'}
                                                        </span>
                                                    </div>
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem',
                                                        fontSize: '0.7rem',
                                                        color: 'var(--foreground2)'
                                                    }}>
                                                        <span>
                                                            {createdAt.toLocaleDateString()} {createdAt.toLocaleTimeString()}
                                                        </span>
                                                        <span>
                                                            スコア: {score.toFixed(1)}
                                                        </span>
                                                    </div>
                                                </div>
                                                
                                                {/* メッセージ内容 */}
                                                <div style={{
                                                    fontSize: '0.9rem',
                                                    lineHeight: '1.4',
                                                    color: 'var(--foreground0)'
                                                }}>
                                                    {highlights.length > 0 ? (
                                                        <div 
                                                            dangerouslySetInnerHTML={{ 
                                                                __html: highlights[0].replace(
                                                                    /<mark>/g, 
                                                                    '<mark style="background-color: var(--warning); color: var(--background0); padding: 1px 2px; border-radius: 2px;">'
                                                                )
                                                            }}
                                                        />
                                                    ) : (
                                                        <div>{message.content}</div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    )
}