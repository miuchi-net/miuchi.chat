/**
 * Service Worker for PWA
 * VitePWAプラグインなしでのPWA実装
 */

const CACHE_NAME = 'miuchi-chat-v1'
const urlsToCache = [
    '/',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
]

// Service Worker インストール
self.addEventListener('install', (event) => {
    console.log('Service Worker: Install event')
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching files')
                return cache.addAll(urlsToCache)
            })
            .then(() => {
                console.log('Service Worker: Installation complete')
                return self.skipWaiting()
            })
    )
})

// Service Worker アクティベート
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activate event')
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache:', cacheName)
                        return caches.delete(cacheName)
                    }
                })
            )
        }).then(() => {
            console.log('Service Worker: Activation complete')
            return self.clients.claim()
        })
    )
})

// ネットワークリクエスト処理
self.addEventListener('fetch', (event) => {
    // 基本的なキャッシュファースト戦略
    if (event.request.method === 'GET') {
        event.respondWith(
            caches.match(event.request)
                .then((response) => {
                    // キャッシュからレスポンスを返すか、ネットワークから取得
                    return response || fetch(event.request)
                })
                .catch(() => {
                    // オフライン時のフォールバック（必要に応じて）
                    if (event.request.destination === 'document') {
                        return caches.match('/')
                    }
                })
        )
    }
})

// プッシュ通知処理
self.addEventListener('push', (event) => {
    console.log('Service Worker: Push received')
    
    if (event.data) {
        const data = event.data.json()
        
        const options = {
            body: data.body || 'New message received',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            tag: 'miuchi-chat-notification',
            data: data.data || {},
            requireInteraction: false,
            silent: false
        }
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'miuchi.chat', options)
        )
    }
})

// 通知クリック処理
self.addEventListener('notificationclick', (event) => {
    console.log('Service Worker: Notification clicked')
    
    event.notification.close()
    
    event.waitUntil(
        clients.openWindow(event.notification.data.url || '/')
    )
})

// メッセージ処理（クライアントとの通信）
self.addEventListener('message', (event) => {
    console.log('Service Worker: Message received:', event.data)
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting()
    }
})