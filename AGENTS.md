# Repository Guidelines

## Project Structure & Module Organization

The workspace is driven by `pnpm`, with the core TypeScript library in `packages/instructor-stream/src`. Feature modules follow folders such as `adapters/`, `stream/`, and `utils/`, while co-located unit specs live in `src/__tests__`. Integration scripts that exercise external APIs live in `integrations/`, and example apps are under `packages/examples`. Provider-specific adapters reside in `packages/providers/src`, with smoke tests in `packages/providers/tests`. Documentation sources sit in `docs/` and are published via `mkdocs`.

## Build, Test, and Development Commands

Install dependencies once with `pnpm install --frozen-lockfile`. Run the library specs by calling `pnpm -C packages/instructor-stream test`, or use `pnpm -C packages/instructor-stream test:watch` while iterating. Build distributables with `pnpm -C packages/instructor-stream build`, which runs `tsup` and refreshes `dist/`. Before publishing, execute the root `pnpm run pre-push` to format, lint, test, and build in one pass. For integration smoke tests, invoke `pnpm -C packages/instructor-stream test:integration`.

## Coding Style & Naming Conventions

Code is TypeScript-first with ES modules and 2-space indentation enforced by Prettier (`pnpm run format`). Imports are auto-sorted using `@ianvs/prettier-plugin-sort-imports`, and static analysis must pass `pnpm run lint` (oxlint). Public entry points should export via `src/index.ts`, and new adapters belong under `src/adapters/<provider-name>.ts`. Use PascalCase for classes, camelCase for functions, and SCREAMING_SNAKE_CASE only for constants in `constants/`.

## Testing Guidelines

Vitest powers both unit and benchmark suites; favor `describe` blocks that mirror directory names (for example, `describe("stream/chunk-consumer")`). Keep new unit tests beside the implementation in `src/__tests__`. For coverage checks, run `pnpm -C packages/instructor-stream test:coverage`, targeting parity with existing modules before merging. Integration harnesses (`tsx integrations/*.ts`) hit external APIs, so gate them behind environment variables and document any required tokens.

## Commit & Pull Request Guidelines

Follow the prevailing conventional commit style seen in history (`fix: normalize langgraph content indices`, `chore: prepare 0.2.3 manual release`). Release commits remain `Release X.Y.Z`. Each PR should include a clear summary, linked issues in the description, and validation notes (e.g., `pnpm -C packages/instructor-stream test`). Attach screenshots or logs when behavior changes user-facing streams. Request review from a maintainer and wait for CI green checks before merging.

## Manual Release Checklist (npm)

Use this flow for the 0.2.x line while we’re publishing by hand:

1. **Prep the workspace**
   - `pnpm install --frozen-lockfile`
   - `pnpm run pre-push`
   - `pnpm -C packages/instructor-stream build`
2. **Update release metadata**
   - Bump the version in `packages/instructor-stream/package.json`
   - Add a matching entry at the top of `packages/instructor-stream/CHANGELOG.md`
   - Stage those files plus any source changes destined for the release
3. **Commit**
   - Commit as `Release X.Y.Z` (e.g. `Release 0.2.7`)
4. **Tag and push**
   - `git tag vX.Y.Z`
   - `git push origin main`
   - `git push origin vX.Y.Z`
5. **Publish to npm**
   - `pnpm -C packages/instructor-stream publish --access public`
6. **Post-publish**
   - Draft GitHub release notes (copy from CHANGELOG)
   - Announce internally if needed
