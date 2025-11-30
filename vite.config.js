import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Event Horizon Chat',
        short_name: 'Horizon',
        description: 'Private Chat App',
        theme_color: '#ffffff',
        display: 'standalone', // Makes it look like an app on mobile
        icons: [
          {
            src: 'pwa-192x192.png', // You can add these icons to /public later
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
