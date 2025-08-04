import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const runProviderTests = process.env.RUN_PROVIDER_TESTS === 'true'
const runBenchmarkTests = process.env.RUN_BENCHMARK_TESTS === 'true'

const projects = [
  './packages/instructor-stream',
  ...(runProviderTests ? ['./packages/providers'] : []),
  ...(runBenchmarkTests ? ['./packages/benchmarks'] : []),
]

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
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
    projects,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './packages/instructor-stream/src'),
      '@providers': path.resolve(__dirname, './packages/providers/src'),
    },
  },
})
