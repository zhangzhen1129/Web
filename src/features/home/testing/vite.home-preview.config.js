import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

export default defineConfig({
  root: projectRoot,
  base: '/',
  plugins: [vue()],
  build: {
    outDir: path.resolve(projectRoot, 'dist-home-preview'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(projectRoot, 'home-preview.html'),
    },
  },
})
