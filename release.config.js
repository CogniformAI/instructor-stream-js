export default {
  git: {
    commitMessage: 'chore(release): release v${version}',
    tagName: 'v${version}',
    pushRepo: 'origin'
  },
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
}