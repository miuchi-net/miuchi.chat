import { useState } from 'react'
import { api } from '../../services/api'
import type { SearchResponse } from '../../types'

interface SearchBoxProps {
    currentRoom?: string;
    onSearchResults: (results: SearchResponse | null) => void;
    isSearching: boolean;
    setIsSearching: (searching: boolean) => void;
}

export function SearchBox({ currentRoom, onSearchResults, isSearching, setIsSearching }: SearchBoxProps) {
    const [query, setQuery] = useState('')
    const [error, setError] = useState<string | null>(null)

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        
        if (!query.trim()) {
            onSearchResults(null)
            return
        }

        setIsSearching(true)
        setError(null)

        try {
            const results = await api.searchMessages(query.trim(), currentRoom)
            onSearchResults(results)
        } catch (err) {
            console.error('Search failed:', err)
            setError('検索に失敗しました')
            onSearchResults(null)
        } finally {
            setIsSearching(false)
        }
    }

    const handleClear = () => {
        setQuery('')
        setError(null)
        onSearchResults(null)
    }

    return (
        <div className="border-bottom p-2">
            <form onSubmit={handleSearch} className="d-flex gap-2">
                <div className="flex-grow-1">
                    <input
                        type="text"
                        className="form-control bg-dark text-light border-secondary"
                        placeholder={`メッセージを検索${currentRoom ? ` (${currentRoom}内)` : ''}...`}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        disabled={isSearching}
                    />
                </div>
                <button 
                    type="submit" 
                    className="btn btn-outline-primary"
                    disabled={isSearching || !query.trim()}
                >
                    {isSearching ? '検索中...' : '検索'}
                </button>
                {query && (
                    <button 
                        type="button" 
                        className="btn btn-outline-secondary"
                        onClick={handleClear}
                        disabled={isSearching}
                    >
                        クリア
                    </button>
                )}
            </form>
            {error && (
                <div className="text-danger mt-2 small">
                    {error}
                </div>
            )}
        </div>
    )
}