import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [
    react(),
  ],
   server: {
    host: 'localhost',
    // Proxy de desenvolvimento para a API do Jev (TypeSafe), evitando CORS no navegador
    proxy: {
      '/typesafe': {
        target: 'https://api.typesafe.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/typesafe/, ''),
      },
    },
  }
})
