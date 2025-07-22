import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/**/*.d.ts',
        'tests/**/*',
        'node_modules/**/*',
        'dist/**/*',
      ],
    },
    projects: [
      {
        test: {
          name: 'root',
          include: ['tests/**/*.test.{ts,tsx}'],
        },
      },
      {
        root: './packages/instructor-stream',
        test: {
          name: 'instructor-stream',
          include: ['tests/**/*.test.{ts,tsx}'],
        },
      },
      {
        root: './packages/providers',
        test: {
          name: 'providers',
          include: ['tests/**/*.test.{ts,tsx}'],
        },
      },
      {
        root: './packages/benchmarks',
        test: {
          name: 'benchmarks',
          include: ['**/*.bench.{ts,tsx}'],
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './packages/instructor-stream/src'),
      '@providers': path.resolve(__dirname, './packages/providers/src'),
    },
  },
})
