import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function CallbackPage() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { setToken, checkAuth } = useAuth()

    useEffect(() => {
        const token = searchParams.get('token')

        if (token) {
            // JWTトークンを保存してユーザー情報を取得
            setToken(token)
            checkAuth().then(() => {
                navigate('/')
            })
        } else {
            // トークンがない場合はログインページにリダイレクト
            navigate('/login')
        }
    }, [searchParams, navigate, setToken, checkAuth])

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: 'var(--background0)',
            color: 'var(--foreground0)'
        }}>
            <div>Processing login...</div>
        </div>
    )
}
