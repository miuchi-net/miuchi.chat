import { useAuth } from '../contexts/AuthContext'
import './LoginPage.css'

const MIUCHI_ASCII_ART = `
███╗   ███╗ ██╗ ██╗   ██╗  ██████╗ ██╗  ██╗ ██╗     
████╗ ████║ ██║ ██║   ██║ ██╔════╝ ██║  ██║ ██║     
██╔████╔██║ ██║ ██║   ██║ ██║      ███████║ ██║     
██║╚██╔╝██║ ██║ ██║   ██║ ██║      ██╔══██║ ██║     
██║ ╚═╝ ██║ ██║ ╚██████╔╝ ╚██████╗ ██║  ██║ ██║     
╚═╝     ╚═╝ ╚═╝  ╚═════╝   ╚═════╝ ╚═╝  ╚═╝ ╚═╝ .net
https://github.com/miuchi-net
`

export default function LoginPage() {
    const { login, devLogin, isLoading } = useAuth()

    const handleGitHubLogin = async () => {
        await login()
    }

    const handleDevLogin = async () => {
        await devLogin()
    }

    return (
        <div className="login-container">
            <div className="login-content">
                {/* ASCII アートヘッダー */}
                <div className="ascii-header">
                    <pre className="ascii-art">{MIUCHI_ASCII_ART}</pre>
                    <div className="status-section">
                        <span className="status-indicator">●</span>
                        <span className="status-text">ONLINE</span>
                    </div>
                </div>

                {/* ログインボタン */}
                <div className="login-section">
                    <button
                        className="login-button"
                        variant-="primary"
                        onClick={handleGitHubLogin}
                        disabled={isLoading}
                    >
                        {isLoading ? '認証中...' : 'GitHubでログイン'}
                    </button>

                    <br />

                    {import.meta.env.DEV && (
                        <button
                            className="dev-login-button"
                            onClick={handleDevLogin}
                            disabled={isLoading}
                        >
                            開発ログイン
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
