import { createRequire } from 'node:module'

const _require = createRequire(import.meta.url)

export default {
  git: false,
  github: {
    release: true,
    assets: false,
  },
  npm: {
    publish: true,
    tarballDir: 'release',
    ignoreScripts: false,
  },
  plugins: {
    '@release-it/conventional-changelog': {
      preset: 'conventionalcommits',
      infile: 'CHANGELOG.md',
    },
  },
  hooks: {
    'after:npm:release': 'rm -rf release',
  },
  workspace: {
    ignoreWorkspaceRootCheck: true,
    workspaces: ['packages/instructor-stream', 'packages/providers'],
  },
}