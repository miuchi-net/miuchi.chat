import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../services/api'
import type { User } from '../types'

interface AuthContextType {
    user: User | null
    isLoading: boolean
    isAuthenticated: boolean
    login: () => Promise<void>
    devLogin: () => Promise<void>
    logout: () => void
    checkAuth: () => Promise<void>
    setUser: (user: User | null) => void
    setToken: (token: string) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}

interface AuthProviderProps {
    children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const isAuthenticated = !!user

    const login = async () => {
        try {
            const response = await api.getLoginUrl()
            window.location.href = response.login_url
        } catch (error) {
            console.error('Login failed:', error)
        }
    }

    const devLogin = async () => {
        try {
            setIsLoading(true)
            // 実際のバックエンドのdev-loginエンドポイントを呼び出し
            const tokenResponse = await api.devLogin()
            localStorage.setItem('token', tokenResponse.access_token)
            
            // トークンを保存後、ユーザー情報を取得
            const userInfo = await api.getCurrentUser()
            setUser(userInfo)
        } catch (error) {
            console.error('Dev login failed:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const logout = () => {
        localStorage.removeItem('token')
        setUser(null)
    }

    const checkAuth = async () => {
        const token = localStorage.getItem('token')
        if (!token) {
            setIsLoading(false)
            return
        }

        try {
            const userInfo = await api.getCurrentUser()
            setUser(userInfo)
        } catch (error) {
            console.error('Auth check failed:', error)
            localStorage.removeItem('token')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        checkAuth()
    }, [])

    const value: AuthContextType = {
        user,
        isLoading,
        isAuthenticated,
        login,
        devLogin,
        logout,
        checkAuth,
        setUser,
        setToken: (token: string) => {
            localStorage.setItem('token', token)
        }
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}
