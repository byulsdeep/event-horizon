import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/event-horizon/', 
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Event Horizon',
        short_name: 'Horizon',
        description: 'Private Chat App',
        theme_color: '#ffffff',
        display: 'standalone', // Makes it look like an app on mobile
        start_url: '/event-horizon',
        scope: '/event-horizon',
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
