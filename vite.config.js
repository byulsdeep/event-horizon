import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa' // Keep PWA

export default defineConfig({
  base: '/event-horizon/', 
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['event-horizon.svg'],
      manifest: {
        name: 'Event Horizon',
        short_name: 'Horizon',
        description: 'Private Real-time Comms',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        start_url: '/event-horizon/',
        scope: '/event-horizon/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})