import { useEffect, useState } from 'react'
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { FaUsers, FaSignOutAlt, FaChevronDown } from 'react-icons/fa'
import './App.css'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import CallbackPage from './pages/CallbackPage'
import ChatPage from './pages/ChatPage'
import LoginPage from './pages/LoginPage'
import OnlineUsersList from './components/chat/OnlineUsersList'
import { notificationManager } from './services/notification'

function ThemeSelector() {
    const [currentTheme, setCurrentTheme] = useState('gruvbox-dark')
    const [isOpen, setIsOpen] = useState(false)

    const themes = [
        { value: 'gruvbox-dark', label: 'Gruvbox Dark' },
        { value: 'gruvbox-light', label: 'Gruvbox Light' },
        { value: 'catppuccin-mocha', label: 'Catppuccin Mocha' },
        { value: 'catppuccin-latte', label: 'Catppuccin Latte' },
        { value: 'nord', label: 'Nord' },
        { value: 'vitesse-dark', label: 'Vitesse Dark' },
        { value: 'vitesse-light', label: 'Vitesse Light' },
        { value: 'dark', label: 'Default Dark' },
        { value: 'light', label: 'Default Light' },
    ]

    useEffect(() => {
        document.documentElement.setAttribute('data-webtui-theme', currentTheme)
    }, [currentTheme])

    const currentThemeLabel = themes.find(theme => theme.value === currentTheme)?.label

    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                is-="button"
                size-="small"
                variant-="background2"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8rem'
                }}
            >
                {currentThemeLabel}
                <FaChevronDown size={10} />
            </button>
            
            {isOpen && (
                <div
                    style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        background: 'var(--background1)',
                        border: '1px solid var(--background2)',
                        borderRadius: '4px',
                        zIndex: 1000,
                        minWidth: '160px',
                        maxHeight: '200px',
                        overflowY: 'auto'
                    }}
                >
                    {themes.map(theme => (
                        <button
                            key={theme.value}
                            onClick={() => {
                                setCurrentTheme(theme.value)
                                setIsOpen(false)
                            }}
                            style={{
                                display: 'block',
                                width: '100%',
                                padding: '0.5rem',
                                background: theme.value === currentTheme ? 'var(--background2)' : 'transparent',
                                color: 'var(--foreground0)',
                                border: 'none',
                                textAlign: 'left',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                fontFamily: 'var(--font-family)'
                            }}
                            onMouseEnter={(e) => {
                                if (theme.value !== currentTheme) {
                                    e.currentTarget.style.background = 'var(--background2)'
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (theme.value !== currentTheme) {
                                    e.currentTarget.style.background = 'transparent'
                                }
                            }}
                        >
                            {theme.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

function Dashboard() {
    const { user, logout } = useAuth()
    const [showOnlineUsers, setShowOnlineUsers] = useState(false)

    return (
        <div className="app">
            <div style={{ 
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--background2)', 
                backgroundColor: 'var(--background1)',
                padding: '0.5rem 1rem',
                height: '60px',
                boxSizing: 'border-box'
            }}>
                <span is-="badge" variant-="background0">MIUCHI.CHAT</span>
                <div style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <button
                        onClick={() => setShowOnlineUsers(true)}
                        is-="button"
                        size-="small"
                        variant-="background2"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.8rem'
                        }}
                        title="オンラインユーザー"
                    >
                        <FaUsers size={12} />
                    </button>
                    <ThemeSelector />
                    {user && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            <img
                                src={user.avatar_url || '/default-avatar.png'}
                                alt={user.username}
                                style={{
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '50%',
                                    border: '1px solid var(--background2)'
                                }}
                            />
                            <span style={{ fontSize: '0.9rem' }}>{user.display_name || user.username}</span>
                            <button 
                                is-="button"
                                size-="small" 
                                variant-="background2" 
                                onClick={logout}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    fontSize: '0.8rem'
                                }}
                                title="ログアウト"
                            >
                                <FaSignOutAlt size={12} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <Routes>
                <Route path="/" element={<ChatPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/chat/:room" element={<ChatPage />} />
            </Routes>

            <OnlineUsersList
                isVisible={showOnlineUsers}
                onClose={() => setShowOnlineUsers(false)}
            />
        </div>
    )
}

function AppContent() {
    const { isAuthenticated, isLoading } = useAuth()

    if (isLoading) {
        return (
            <div is-="column" align-="center center" style={{ height: '100vh' }}>
                <span>Loading...</span>
            </div>
        )
    }

    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/callback" element={<CallbackPage />} />
            <Route path="/*" element={
                isAuthenticated ? <Dashboard /> : <LoginPage />
            } />
        </Routes>
    )
}

function App() {
    useEffect(() => {
        // PWA初期化
        notificationManager.initialize().then((service) => {
            console.log('PWA初期化完了:', service)
            
            // 開発モードでは通知テスト
            if (import.meta.env.DEV && service.isSupported) {
                setTimeout(() => {
                    notificationManager.showNotification(
                        'miuchi.chat PWA',
                        'PWA機能が有効になりました！'
                    )
                }, 2000)
            }
        }).catch(console.error)
    }, [])

    return (
        <Router>
            <AuthProvider>
                <AppContent />
            </AuthProvider>
        </Router>
    )
}

export default App
