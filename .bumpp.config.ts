import { defineConfig } from 'bumpp'

export default defineConfig({
  tag: true,
  commit: 'release: v%s',
  push: false,
  all: true,
})
