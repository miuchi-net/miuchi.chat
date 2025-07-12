/**
 * 通話コントロールUI
 */

import React, { useState, useEffect, useRef } from 'react';
import { WebRTCManager, CallState } from '../../services/webrtc';
import { WebSocketManager, wsService } from '../../services/websocket';

interface CallControlsProps {
    roomId: string;
    onlineUsers: Array<{ user_id: string; username: string }>;
}

export const CallControls: React.FC<CallControlsProps> = ({ roomId, onlineUsers }) => {
    const [webRTC] = useState(() => new WebRTCManager(new WebSocketManager(wsService)));
    const [callState, setCallState] = useState<CallState>({
        isCallActive: false,
        isIncomingCall: false,
        isMuted: false,
        roomId: ''
    });
    const [error, setError] = useState<string>('');
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    
    const localAudioRef = useRef<HTMLAudioElement>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        // 通話状態の更新を監視
        webRTC.setCallStateCallback((state: CallState) => {
            setCallState(state);
            setError('');
        });

        // リモートストリームを受信
        webRTC.setRemoteStreamCallback((stream: MediaStream) => {
            if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = stream;
                remoteAudioRef.current.play().catch(console.error);
            }
        });

        return () => {
            webRTC.endCall();
        };
    }, [webRTC]);

    useEffect(() => {
        // ローカルストリームを設定
        const localStream = webRTC.getLocalStream();
        if (localStream && localAudioRef.current) {
            localAudioRef.current.srcObject = localStream;
            localAudioRef.current.muted = true; // エコー防止のためローカルはミュート
        }
    }, [callState.isCallActive, webRTC]);

    const handleStartCall = async () => {
        if (!selectedUserId) {
            setError('通話相手を選択してください');
            return;
        }

        try {
            setError('');
            await webRTC.startCall(roomId, selectedUserId);
        } catch (error) {
            console.error('Failed to start call:', error);
            setError(error instanceof Error ? error.message : '通話の開始に失敗しました');
        }
    };

    const handleAnswerCall = async () => {
        try {
            setError('');
            await webRTC.answerCall();
        } catch (error) {
            console.error('Failed to answer call:', error);
            setError(error instanceof Error ? error.message : '通話の応答に失敗しました');
        }
    };

    const handleEndCall = async () => {
        try {
            await webRTC.endCall();
            setError('');
        } catch (error) {
            console.error('Failed to end call:', error);
        }
    };

    const handleToggleMute = () => {
        webRTC.toggleMute();
    };

    // 現在のユーザーを除外したオンラインユーザーリスト
    const availableUsers = onlineUsers.filter((user: {user_id: string, username: string}) => user.user_id !== getCurrentUserId());

    if (callState.isIncomingCall) {
        return (
            <div className="call-controls incoming-call">
                <div className="incoming-call-info">
                    <div className="call-icon">📞</div>
                    <div className="caller-info">
                        <div className="caller-name">{callState.callerUsername || 'Unknown User'}</div>
                        <div className="call-status">着信中...</div>
                    </div>
                </div>
                
                <div className="call-actions">
                    <button 
                        className="call-btn answer-btn"
                        onClick={handleAnswerCall}
                        title="通話に応答"
                    >
                        📞 応答
                    </button>
                    <button 
                        className="call-btn decline-btn"
                        onClick={handleEndCall}
                        title="通話を拒否"
                    >
                        📞 拒否
                    </button>
                </div>

                {error && <div className="call-error">{error}</div>}
            </div>
        );
    }

    if (callState.isCallActive) {
        return (
            <div className="call-controls active-call">
                <div className="active-call-info">
                    <div className="call-icon">🎙️</div>
                    <div className="call-status">通話中</div>
                </div>
                
                <div className="call-actions">
                    <button 
                        className={`call-btn mute-btn ${callState.isMuted ? 'muted' : ''}`}
                        onClick={handleToggleMute}
                        title={callState.isMuted ? 'ミュート解除' : 'ミュート'}
                    >
                        {callState.isMuted ? '🔇' : '🎙️'} {callState.isMuted ? 'ミュート中' : 'ミュート'}
                    </button>
                    <button 
                        className="call-btn end-btn"
                        onClick={handleEndCall}
                        title="通話終了"
                    >
                        📞 終了
                    </button>
                </div>

                {error && <div className="call-error">{error}</div>}
                
                {/* オーディオ要素 */}
                <audio ref={localAudioRef} autoPlay muted />
                <audio ref={remoteAudioRef} autoPlay />
            </div>
        );
    }

    return (
        <div className="call-controls idle">
            <div className="call-setup">
                <div className="user-selector">
                    <label htmlFor="call-user-select">通話相手を選択:</label>
                    <select 
                        id="call-user-select"
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        className="user-select"
                    >
                        <option value="">-- ユーザーを選択 --</option>
                        {availableUsers.map(user => (
                            <option key={user.user_id} value={user.user_id}>
                                {user.username}
                            </option>
                        ))}
                    </select>
                </div>
                
                <button 
                    className="call-btn start-btn"
                    onClick={handleStartCall}
                    disabled={!selectedUserId || availableUsers.length === 0}
                    title="通話を開始"
                >
                    📞 通話開始
                </button>
            </div>

            {availableUsers.length === 0 && (
                <div className="no-users-message">
                    現在通話可能なユーザーがいません
                </div>
            )}

            {error && <div className="call-error">{error}</div>}
        </div>
    );
};

// 現在のユーザーIDを取得するヘルパー関数
function getCurrentUserId(): string {
    // JWTトークンからユーザーIDを取得
    const token = localStorage.getItem('token');
    if (!token) return '';
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.sub || '';
    } catch {
        return '';
    }
}