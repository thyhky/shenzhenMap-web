import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig({
  publicDir: 'public',
  plugins: [uni()],
  server: {
    proxy: {
      '/api': {
        target: 'https://map.okzer.xyz',
        changeOrigin: true,
      },
    },
  },
})
