import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [
    react(),
  ],
   server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Proxy de desenvolvimento para a API do Jev (TypeSafe), evitando CORS no navegador
    proxy: {
      '/api/chatgpt': { target: 'http://127.0.0.1:1455' },
      '/typesafe': {
        target: 'https://api.typesafe.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/typesafe/, ''),
      },
    },
  }
})
