/**
 * WebRTC通話機能の実装
 */

import { WebSocketManager } from './websocket';

export interface CallState {
    isCallActive: boolean;
    isIncomingCall: boolean;
    callerId?: string;
    callerUsername?: string;
    isMuted: boolean;
    roomId: string;
}

export interface ICEServers {
    urls: string[];
    username?: string;
    credential?: string;
}

export class WebRTCManager {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private wsManager: WebSocketManager;
    private roomId: string = '';
    private userId: string = '';
    private callStateCallback?: (state: CallState) => void;
    private remoteStreamCallback?: (stream: MediaStream) => void;
    
    // ICEサーバー設定（本番環境では適切なSTUN/TURNサーバーを設定）
    private iceServers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ];

    private callState: CallState = {
        isCallActive: false,
        isIncomingCall: false,
        isMuted: false,
        roomId: ''
    };

    constructor(wsManager: WebSocketManager) {
        this.wsManager = wsManager;
        this.setupWebSocketHandlers();
    }

    /**
     * WebSocketメッセージハンドラーを設定
     */
    private setupWebSocketHandlers() {
        this.wsManager.addMessageHandler('webrtc_offer', (message: any) => {
            this.handleIncomingOffer(message);
        });

        this.wsManager.addMessageHandler('webrtc_answer', (message: any) => {
            this.handleIncomingAnswer(message);
        });

        this.wsManager.addMessageHandler('webrtc_ice_candidate', (message: any) => {
            this.handleIncomingIceCandidate(message);
        });
    }

    /**
     * 通話状態の更新コールバックを設定
     */
    setCallStateCallback(callback: (state: CallState) => void) {
        this.callStateCallback = callback;
    }

    /**
     * リモートストリーム受信コールバックを設定
     */
    setRemoteStreamCallback(callback: (stream: MediaStream) => void) {
        this.remoteStreamCallback = callback;
    }

    /**
     * 通話を開始
     */
    async startCall(roomId: string, targetUserId: string): Promise<void> {
        try {
            this.roomId = roomId;
            
            // ローカルメディアストリームを取得
            await this.initializeLocalStream();
            
            // RTCPeerConnectionを作成
            await this.createPeerConnection();
            
            // Offerを作成して送信
            const offer = await this.peerConnection!.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false, // 音声のみ
            });
            
            await this.peerConnection!.setLocalDescription(offer);
            
            // WebSocket経由でOfferを送信
            this.wsManager.send({
                type: 'webrtc_offer',
                room: roomId,
                to_user_id: targetUserId,
                offer: offer
            });

            this.updateCallState({
                isCallActive: true,
                isIncomingCall: false,
                roomId
            });

            console.log('Call initiated to user:', targetUserId);
        } catch (error) {
            console.error('Failed to start call:', error);
            await this.endCall();
            throw error;
        }
    }

    /**
     * 通話に応答
     */
    async answerCall(): Promise<void> {
        try {
            if (!this.peerConnection) {
                throw new Error('No active peer connection');
            }

            // ローカルメディアストリームを取得
            await this.initializeLocalStream();

            // Answerを作成して送信
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            // WebSocket経由でAnswerを送信
            this.wsManager.send({
                type: 'webrtc_answer',
                room: this.roomId,
                to_user_id: this.callState.callerId!,
                answer: answer
            });

            this.updateCallState({
                ...this.callState,
                isCallActive: true,
                isIncomingCall: false
            });

            console.log('Call answered');
        } catch (error) {
            console.error('Failed to answer call:', error);
            await this.endCall();
            throw error;
        }
    }

    /**
     * 通話を終了
     */
    async endCall(): Promise<void> {
        try {
            // ローカルストリームを停止
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }

            // RTCPeerConnectionを閉じる
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }

            this.remoteStream = null;

            this.updateCallState({
                isCallActive: false,
                isIncomingCall: false,
                isMuted: false,
                roomId: ''
            });

            console.log('Call ended');
        } catch (error) {
            console.error('Error ending call:', error);
        }
    }

    /**
     * マイクのミュート切り替え
     */
    toggleMute(): void {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.updateCallState({
                    ...this.callState,
                    isMuted: !audioTrack.enabled
                });
                console.log('Microphone', audioTrack.enabled ? 'unmuted' : 'muted');
            }
        }
    }

    /**
     * ローカルメディアストリームを初期化
     */
    private async initializeLocalStream(): Promise<void> {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: false
            });
            console.log('Local stream initialized');
        } catch (error) {
            console.error('Failed to get local stream:', error);
            throw new Error('マイクへのアクセスが拒否されました。ブラウザの設定を確認してください。');
        }
    }

    /**
     * RTCPeerConnectionを作成・設定
     */
    private async createPeerConnection(): Promise<void> {
        this.peerConnection = new RTCPeerConnection({
            iceServers: this.iceServers
        });

        // ローカルストリームを追加
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection!.addTrack(track, this.localStream!);
            });
        }

        // リモートストリーム受信の処理
        this.peerConnection.ontrack = (event) => {
            console.log('Remote stream received');
            this.remoteStream = event.streams[0];
            if (this.remoteStreamCallback) {
                this.remoteStreamCallback(this.remoteStream);
            }
        };

        // ICE候補の処理
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Sending ICE candidate');
                this.wsManager.send({
                    type: 'webrtc_ice_candidate',
                    room: this.roomId,
                    to_user_id: this.callState.callerId || this.userId,
                    candidate: event.candidate
                });
            }
        };

        // 接続状態の監視
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection?.connectionState);
            if (this.peerConnection?.connectionState === 'disconnected' || 
                this.peerConnection?.connectionState === 'failed') {
                this.endCall();
            }
        };
    }

    /**
     * 着信Offerの処理
     */
    private async handleIncomingOffer(message: any): Promise<void> {
        try {
            console.log('Incoming call from:', message.to_user_id);
            
            this.roomId = message.room;
            this.updateCallState({
                isCallActive: false,
                isIncomingCall: true,
                callerId: message.to_user_id,
                callerUsername: message.to_user_id, // TODO: ユーザー名を取得
                roomId: message.room
            });

            // RTCPeerConnectionを作成
            await this.createPeerConnection();
            
            // リモートDescriptionを設定
            await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(message.offer));
            
        } catch (error) {
            console.error('Failed to handle incoming offer:', error);
            await this.endCall();
        }
    }

    /**
     * 着信Answerの処理
     */
    private async handleIncomingAnswer(message: any): Promise<void> {
        try {
            console.log('Received answer from:', message.to_user_id);
            
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
                console.log('Answer processed successfully');
            }
        } catch (error) {
            console.error('Failed to handle incoming answer:', error);
            await this.endCall();
        }
    }

    /**
     * 着信ICE Candidateの処理
     */
    private async handleIncomingIceCandidate(message: any): Promise<void> {
        try {
            if (this.peerConnection) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
                console.log('ICE candidate added');
            }
        } catch (error) {
            console.error('Failed to handle ICE candidate:', error);
        }
    }

    /**
     * 通話状態を更新
     */
    private updateCallState(newState: Partial<CallState>): void {
        this.callState = { ...this.callState, ...newState };
        if (this.callStateCallback) {
            this.callStateCallback(this.callState);
        }
    }

    /**
     * 現在の通話状態を取得
     */
    getCallState(): CallState {
        return { ...this.callState };
    }

    /**
     * ローカルストリームを取得
     */
    getLocalStream(): MediaStream | null {
        return this.localStream;
    }

    /**
     * リモートストリームを取得
     */
    getRemoteStream(): MediaStream | null {
        return this.remoteStream;
    }
}