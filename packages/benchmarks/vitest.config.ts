import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.bench.ts'],
    benchmark: {
      include: ['**/*.bench.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../instructor-stream/src'),
      '@core': path.resolve(__dirname, '../instructor-stream/src'),
    },
  },
})
