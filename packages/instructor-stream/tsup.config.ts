import { defineConfig } from 'tsup'

export default defineConfig((options) => {
  return {
    splitting: true,
    sourcemap: true,
    minify: true,
    entry: {
      index: 'src/index.ts',
      'adapters/langgraph/index': 'src/adapters/langgraph/index.ts',
      'adapters/openai/index': 'src/adapters/openai/index.ts',
      'adapters/anthropic/index': 'src/adapters/anthropic/index.ts',
      'adapters/google/index': 'src/adapters/google/index.ts',
    },
    target: 'es2020',
    format: ['cjs', 'esm'],
    clean: true,
    dts: true,
    external: ['openai', 'zod', '@anthropic-ai/sdk', '@google/generative-ai'],
    ...options,
  }
})
