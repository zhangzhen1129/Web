import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => ({
  base: '/',
  plugins: [vue()],
  build: {
    outDir: mode === 'test' ? 'dist-test' : 'dist',
  },
}))
