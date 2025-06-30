import axios from 'axios'
import type { TokenResponse, User } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const apiClient = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    headers: {
        'Content-Type': 'application/json',
    },
})

// Request interceptor to add auth token
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

// Response interceptor to handle auth errors
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        // ネットワークエラーの処理
        if (!error.response) {
            console.error('Network error:', error.message)
            return Promise.reject({
                ...error,
                message: 'ネットワークエラーが発生しました。接続を確認してください。'
            })
        }

        // HTTPステータスエラーの処理
        switch (error.response.status) {
            case 401:
                console.warn('Authentication failed, redirecting to login')
                localStorage.removeItem('token')
                window.location.href = '/login'
                break
            case 403:
                console.warn('Access forbidden')
                break
            case 404:
                console.warn('Resource not found')
                break
            case 429:
                console.warn('Rate limit exceeded')
                break
            case 500:
                console.error('Internal server error')
                break
            default:
                console.error('HTTP error:', error.response.status, error.response.data)
        }
        
        return Promise.reject(error)
    }
)

export const api = {
    // Auth endpoints
    getLoginUrl: async () => {
        const response = await apiClient.get('/auth/login-url')
        return response.data
    },

    devLogin: async (): Promise<TokenResponse> => {
        const response = await apiClient.post('/auth/dev-login')
        return response.data
    },

    getCurrentUser: async (): Promise<User> => {
        const response = await apiClient.get('/auth/me')
        return response.data
    },

    // Chat endpoints
    getMessages: async (room: string, limit?: number, from?: string) => {
        const params = new URLSearchParams()
        if (limit) params.append('limit', limit.toString())
        if (from) params.append('from', from)

        const url = `/chat/${room}/messages?${params}`
        console.log('🌐 API Request:', url)
        console.log('📊 Request params:', { room, limit, from })
        
        const response = await apiClient.get(url)
        console.log('🌐 API Response status:', response.status)
        console.log('🌐 API Response data:', response.data)
        return response.data
    },

    sendMessage: async (room: string, content: string, messageType = 'text') => {
        const response = await apiClient.post(`/chat/${room}/send`, {
            content,
            message_type: messageType,
        })
        return response.data
    },

    createRoom: async (name: string, description?: string, isPublic: boolean = true) => {
        const response = await apiClient.post('/chat/rooms', {
            name,
            description,
            is_public: isPublic,
        })
        return response.data
    },

    getRooms: async () => {
        const response = await apiClient.get('/chat/rooms')
        return response.data
    },

    getRoomMembers: async (room: string) => {
        const response = await apiClient.get(`/chat/${room}/members`)
        return response.data
    },

    inviteUser: async (room: string, username: string) => {
        const response = await apiClient.post(`/chat/${room}/invite`, {
            username
        })
        return response.data
    },

    getOnlineUsers: async () => {
        const response = await apiClient.get('/chat/online-users')
        return response.data
    },

    // Search endpoints
    searchMessages: async (query: string, room?: string) => {
        const params = new URLSearchParams({ q: query })
        if (room) params.append('room', room)

        const response = await apiClient.get(`/search/messages?${params}`)
        return response.data
    },
}
