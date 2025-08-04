import { defineConfig } from 'changelogen'

export default defineConfig({
  preset: 'conventional',
  release: true,
  outputFile: 'CHANGELOG.md',
  github: {
    repo: 'cogniformai/instructor-stream-js',
  },
  types: {
    feat: { semver: 'minor' },
    fix: { semver: 'patch' },
    docs: { semver: 'patch' },
    style: { semver: 'patch' },
    refactor: { semver: 'patch' },
    perf: { semver: 'patch' },
    test: { semver: 'patch' },
    build: { semver: 'patch' },
    ci: { semver: 'patch' },
    chore: { semver: 'patch' },
  },
})