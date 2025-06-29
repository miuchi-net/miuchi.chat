import { useEffect, useState } from 'react'
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import './App.css'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import CallbackPage from './pages/CallbackPage'
import ChatPage from './pages/ChatPage'
import LoginPage from './pages/LoginPage'

function ThemeSelector() {
    const [currentTheme, setCurrentTheme] = useState('gruvbox-dark')

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

    return (
        <select
            value={currentTheme}
            onChange={(e) => setCurrentTheme(e.target.value)}
            style={{
                background: 'var(--background1)',
                color: 'var(--foreground0)',
                border: '1px solid var(--background2)',
                borderRadius: '4px',
                padding: '0.25rem 0.5rem',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-family)'
            }}
        >
            {themes.map(theme => (
                <option key={theme.value} value={theme.value}>
                    {theme.label}
                </option>
            ))}
        </select>
    )
}

function Dashboard() {
    const { user, logout } = useAuth()

    return (
        <div className="app">
            <div is-="row" align-="between center" pad-="0 1" style={{ borderBottom: '1px solid var(--background2)', backgroundColor: 'var(--background1)' }}>
                <span is-="badge" variant-="background0">MIUCHI.CHAT</span>
                <div is-="row" align-="center" gap-="1">
                    <ThemeSelector />
                    {user && (
                        <>
                            <img
                                src={user.avatar_url || '/default-avatar.png'}
                                alt={user.username}
                                className="w-5 h-5 rounded border"
                            />
                            <span style={{ fontSize: '0.9rem' }}>{user.display_name || user.username}</span>
                            <button size-="small" variant-="background2" onClick={logout}>
                                logout
                            </button>
                        </>
                    )}
                </div>
            </div>

            <Routes>
                <Route path="/" element={<ChatPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/chat/:room" element={<ChatPage />} />
            </Routes>
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
    return (
        <Router>
            <AuthProvider>
                <AppContent />
            </AuthProvider>
        </Router>
    )
}

export default App
