import { formatDistanceToNow } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { SearchResponse } from '../../types'

interface SearchResultsProps {
    searchResults: SearchResponse | null;
    isSearching: boolean;
    onClose: () => void;
}

export function SearchResults({ searchResults, isSearching, onClose }: SearchResultsProps) {
    if (isSearching) {
        return (
            <div className="p-3 text-center">
                <div className="spinner-border text-primary me-2" role="status">
                    <span className="visually-hidden">検索中...</span>
                </div>
                検索中...
            </div>
        )
    }

    if (!searchResults) {
        return null
    }

    const { results, total_hits, query_time_ms } = searchResults

    return (
        <div className="flex-grow-1 overflow-auto">
            <div className="border-bottom p-2 d-flex justify-content-between align-items-center">
                <div className="small text-muted">
                    {total_hits}件の結果 ({query_time_ms}ms)
                </div>
                <button 
                    className="btn btn-outline-secondary btn-sm"
                    onClick={onClose}
                >
                    閉じる
                </button>
            </div>
            
            {results.length === 0 ? (
                <div className="p-3 text-center text-muted">
                    検索結果が見つかりませんでした
                </div>
            ) : (
                <div className="p-2">
                    {results.map((result) => {
                        const { message, highlights, score } = result
                        const createdAt = new Date(message.created_at)
                        
                        return (
                            <div key={message.id} className="border-bottom border-secondary py-2">
                                <div className="d-flex justify-content-between align-items-start mb-1">
                                    <div className="d-flex align-items-center gap-2">
                                        {message.author_avatar && (
                                            <img
                                                src={message.author_avatar}
                                                alt={message.author_name}
                                                className="rounded-circle"
                                                width="24"
                                                height="24"
                                            />
                                        )}
                                        <span className="fw-bold text-primary">
                                            {message.author_name}
                                        </span>
                                        <span className="badge bg-secondary small">
                                            {message.room_id}
                                        </span>
                                    </div>
                                    <div className="d-flex align-items-center gap-2">
                                        <span className="small text-muted">
                                            スコア: {score.toFixed(2)}
                                        </span>
                                        <span className="small text-muted">
                                            {formatDistanceToNow(createdAt, { 
                                                addSuffix: true, 
                                                locale: ja 
                                            })}
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="small">
                                    {highlights.length > 0 ? (
                                        <div 
                                            className="text-light"
                                            dangerouslySetInnerHTML={{ 
                                                __html: highlights[0] 
                                            }}
                                        />
                                    ) : (
                                        <div className="text-light">
                                            {message.content}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}