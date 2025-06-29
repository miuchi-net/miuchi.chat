import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        host: true,
        proxy: {
            '/api': {
                target: 'http://backend:3000',
                changeOrigin: true
            },
            '/ws': {
                target: 'ws://backend:3000',
                ws: true,
                changeOrigin: true
            }
        }
    }
})
