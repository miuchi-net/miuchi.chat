/**
 * プッシュ通知とService Worker管理
 */

import React from 'react'

// VAPID公開キー（本番では環境変数から取得）
const VAPID_PUBLIC_KEY = 'BKlJGKqx1Q9TkDr7QTmHGJlJQJQqQ9FQxJJlLJKQJKqQLJKQJKqQLJKQJKqQLJKQJKqQLJKQJKqQ'

export interface NotificationService {
    isSupported: boolean
    isPermissionGranted: boolean
    subscription: PushSubscription | null
}

class NotificationManager {
    private registration: ServiceWorkerRegistration | null = null

    async initialize(): Promise<NotificationService> {
        // Service Worker 登録
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js', {
                    scope: '/'
                })
                
                console.log('Service Worker registered:', registration)
                this.registration = registration
                
                // Service Worker更新チェック
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                console.log('New content available, will update...')
                                // 自動更新
                                newWorker.postMessage({ type: 'SKIP_WAITING' })
                                window.location.reload()
                            }
                        })
                    }
                })
                
                // Service Worker準備完了時の通知
                if (registration.active) {
                    console.log('App ready to work offline')
                    this.showNotification('オフライン対応', 'アプリがオフラインで利用可能になりました')
                }
                
            } catch (error) {
                console.error('Service Worker registration failed:', error)
            }
        }

        return {
            isSupported: this.isNotificationSupported(),
            isPermissionGranted: this.isPermissionGranted(),
            subscription: await this.getCurrentSubscription()
        }
    }

    private isNotificationSupported(): boolean {
        return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
    }

    private isPermissionGranted(): boolean {
        return Notification.permission === 'granted'
    }

    async requestPermission(): Promise<boolean> {
        if (!this.isNotificationSupported()) {
            console.warn('Notifications not supported')
            return false
        }

        if (Notification.permission === 'granted') {
            return true
        }

        const permission = await Notification.requestPermission()
        return permission === 'granted'
    }

    async subscribeToPush(): Promise<PushSubscription | null> {
        if (!this.isNotificationSupported() || !this.isPermissionGranted()) {
            console.warn('Cannot subscribe to push: permission not granted or not supported')
            return null
        }

        if (!this.registration) {
            console.warn('Service Worker not registered')
            return null
        }

        try {
            const subscription = await this.registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            })

            // サーバーに購読情報を送信
            await this.sendSubscriptionToServer(subscription)
            return subscription
        } catch (error) {
            console.error('Push subscription failed:', error)
            return null
        }
    }

    async unsubscribeFromPush(): Promise<boolean> {
        const subscription = await this.getCurrentSubscription()
        if (!subscription) {
            return true
        }

        try {
            await subscription.unsubscribe()
            await this.removeSubscriptionFromServer(subscription)
            return true
        } catch (error) {
            console.error('Push unsubscription failed:', error)
            return false
        }
    }

    private async getCurrentSubscription(): Promise<PushSubscription | null> {
        if (!this.registration) {
            return null
        }

        try {
            return await this.registration.pushManager.getSubscription()
        } catch (error) {
            console.error('Failed to get current subscription:', error)
            return null
        }
    }

    private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
        try {
            const response = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    subscription: subscription.toJSON()
                })
            })

            if (!response.ok) {
                throw new Error('Failed to send subscription to server')
            }

            console.log('Subscription sent to server successfully')
        } catch (error) {
            console.error('Failed to send subscription to server:', error)
        }
    }

    private async removeSubscriptionFromServer(subscription: PushSubscription): Promise<void> {
        try {
            const response = await fetch('/api/push/unsubscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    subscription: subscription.toJSON()
                })
            })

            if (!response.ok) {
                throw new Error('Failed to remove subscription from server')
            }

            console.log('Subscription removed from server successfully')
        } catch (error) {
            console.error('Failed to remove subscription from server:', error)
        }
    }

    async showNotification(title: string, body: string, options?: NotificationOptions): Promise<void> {
        if (!this.isNotificationSupported() || !this.isPermissionGranted()) {
            console.warn('Cannot show notification: permission not granted or not supported')
            return
        }

        const defaultOptions: NotificationOptions = {
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png'
        }

        const notificationOptions = { ...defaultOptions, ...options, body }

        if (this.registration) {
            await this.registration.showNotification(title, notificationOptions)
        } else {
            new Notification(title, notificationOptions)
        }
    }

    private urlBase64ToUint8Array(base64String: string): Uint8Array {
        const padding = '='.repeat((4 - base64String.length % 4) % 4)
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
        
        const rawData = window.atob(base64)
        const outputArray = new Uint8Array(rawData.length)
        
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i)
        }
        
        return outputArray
    }
}

// シングルトンインスタンス
export const notificationManager = new NotificationManager()

// React Hook
export function useNotifications() {
    const [service, setService] = React.useState<NotificationService>({
        isSupported: false,
        isPermissionGranted: false,
        subscription: null
    })

    React.useEffect(() => {
        notificationManager.initialize().then(setService)
    }, [])

    const requestPermission = async () => {
        const granted = await notificationManager.requestPermission()
        if (granted) {
            const subscription = await notificationManager.subscribeToPush()
            setService(prev => ({
                ...prev,
                isPermissionGranted: true,
                subscription
            }))
        }
    }

    const unsubscribe = async () => {
        const success = await notificationManager.unsubscribeFromPush()
        if (success) {
            setService(prev => ({
                ...prev,
                subscription: null
            }))
        }
    }

    const showNotification = (title: string, body: string, options?: NotificationOptions) => {
        return notificationManager.showNotification(title, body, options)
    }

    return {
        service,
        requestPermission,
        unsubscribe,
        showNotification
    }
}