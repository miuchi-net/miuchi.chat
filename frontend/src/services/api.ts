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
        if (error.response?.status === 401) {
            localStorage.removeItem('token')
            window.location.href = '/login'
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

        const response = await apiClient.get(`/chat/${room}/messages?${params}`)
        return response.data
    },

    sendMessage: async (room: string, content: string, messageType = 'text') => {
        const response = await apiClient.post(`/chat/${room}/send`, {
            content,
            message_type: messageType,
        })
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
