import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  base: '/poker-coach/',
  // Cast: vite@8 vs vitest's bundled vite types disagree on PluginOption
  plugins: [react() as never],
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
