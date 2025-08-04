# Release Migration Plan – Changesets ➜ UnJS Stack

This document describes how we will migrate the **instructor-stream-js** monorepo from Changesets-based releases to the UnJS toolchain (**bumpp + changelogen + release-it + release-action**) while keeping:

- A **single shared semantic version** for the whole workspace
- **Only two public packages** published to npm:  
  - `@cogniformai/instructor-stream-js`  
  - `@cogniformai/providers`

---

## High-Level Flow

```mermaid
flowchart TD
    A(Feature branch) <--> B{Local pre-push script<br>lint → build → test}
    B --passes--> C[git push + gh pr create<br>(via `pnpm push-pr`)]
    C --> D[GitHub `test-pr` workflow]
    D -->|review| E[Merge PR → main]
    E --> F[GitHub `release` workflow<br>bumpp → build → changelogen → npm publish]
    F --> G[GitHub Release, tag, CHANGELOG.md]
```

---

## Detailed Action Items

### 1. Remove Changesets

- Delete the **`.changeset/`** directory and remove `@changesets/*` dev dependencies.
- Delete **`.github/workflows/release-pr.yml`** and **`publish.yml`**.
- Delete or replace npm scripts:  
  `changeset`, `release`, `version-packages`, `publish-packages`.

### 2. Add UnJS Tooling

**Dev dependencies (root `package.json`)**

```jsonc
"devDependencies": {
  "bumpp": "^9.0.0",
  "changelogen": "^0.12.0",
  "release-it": "^17.0.0",
  "@release-it/conventional-changelog": "^7.0.0"
}
```

**Root scripts**

```jsonc
"scripts": {
  "release": "pnpm build:workspace && bumpp && changelogen --release && git push --follow-tags && release-it --config ./release.config.js",
  "push-pr": "pnpm pre-push && git push -u origin HEAD && gh pr create -f -l auto-pr"
}
```

**`.bumpp.config.ts`**

```ts
import { defineConfig } from 'bumpp'
export default defineConfig({
  tag: true,
  commit: 'release: v%s',
  push: false
})
```

### 3. `changelog.config.ts`

```ts
import { defineConfig } from 'changelogen'
export default defineConfig({
  github: {
    repo: 'cogniformai/instructor-stream-js'
  },
  release: true
})
```

### 4. `release.config.js`

```js
module.exports = {
  git: false,
  npm: {
    publish: true,
    tarballDir: 'release',
    ignoreScripts: false
  },
  plugins: {
    '@release-it/conventional-changelog': {
      preset: 'conventionalcommits'
    }
  },
  pkgFiles: ['package.json'],
  hooks: {
    'after:npm:release': 'rm -rf release'
  },
  workspace: {
    ignoreWorkspaceRootCheck: true,
    // Only publish selected workspaces
    workspaces: [
      'packages/instructor-stream',
      'packages/providers'
    ]
  }
}
```

### 5. GitHub Release Workflow

`.github/workflows/release.yml`

```yaml
name: Release
on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      actions: write
      packages: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v3
        with:
          version: latest
      - uses: actions/setup-node@v4
        with:
          node-version: 22.17.1
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run release
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          GH_TOKEN:  ${{ secrets.GITHUB_TOKEN }}
```

### 6. Husky Pre-Push

```bash
# .husky/pre-push
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"
pnpm pre-push
```

### 7. Version Propagation

- Root `package.json` keeps the actual version (e.g. `1.2.0`).  
- Package `package.json` files set `"version": "workspace:*"` so bumpp only edits the root.

### 8. Secrets

- `NPM_TOKEN` with publish rights to the CogniformAI scope.
- `GITHUB_TOKEN` is provided automatically by Actions.

---

## Rollback

Reverting is easy: restore the `.changeset` directory and previous workflows, reinstall Changeset deps.

---

## Next Steps

1. Merge this plan.  
2. Implement the file additions/removals.  
3. Run `pnpm release --dry-run` locally once to validate.