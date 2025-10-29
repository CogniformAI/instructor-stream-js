import { defineConfig } from 'tsup'

export default defineConfig((options) => {
  return {
    splitting: true,
    sourcemap: true,
    minify: true,
    entry: {
      index: 'src/index.ts',
      'langgraph/index': 'src/langgraph/index.ts',
    },
    target: 'es2020',
    format: ['cjs', 'esm'],
    clean: true,
    dts: true,
    external: ['openai', 'zod', '@anthropic-ai/sdk', '@google/generative-ai'],
    ...options,
  }
})
