# Repository Guidelines

## Project Structure & Module Organization

The workspace uses pnpm; the new Effect runtime and service graph live under `packages/instructor-stream/src/effect/`, LangGraph utilities under `src/langgraph/`, and shared helpers in `src/utils/`. Unit tests sit beside code in `__tests__` folders. Legacy code has been removed; all new work should target the Effect pipeline. Provider adapters for integrations remain in `packages/providers/src` with tests in `packages/providers/tests/`. Examples and benchmarking harnesses reside in `packages/examples/` and `packages/benchmarks/`. Builds emit to each package `dist/`, while shared configs (`tsconfig.json`, `.prettierrc`, `.oxlintrc.json`) and MkDocs content under `docs/` live at the repo root.

## Build, Test & Development Commands

Install dependencies via `pnpm install`. Use `pnpm --filter @cogniformai/instructor-stream run dev` for watch-mode builds or `pnpm dev` to watch all packages. `pnpm build` fans out `tsup` builds, and `pnpm typecheck` runs workspace TypeScript. Guard style with `pnpm lint`, `pnpm format:check`, and fix using `pnpm format`. Run unit suites through `pnpm test`; add coverage with `pnpm --filter @cogniformai/instructor-stream run test:coverage`.

## Coding Style & Naming Conventions

Code ships as TypeScript ES modules. Prettier enforces two-space indentation, 100-character lines, single quotes, and no semicolons while `@ianvs/prettier-plugin-sort-imports` keeps import groups orderly. `oxlint` replaces ESLint and promotes strict TypeScript hygiene—avoid `any`, prefer explicit return types, and keep test overrides only in `.test.ts`. The `@` alias targets `packages/instructor-stream/src`; use `.ts` filenames for source and reserve `.d.ts` for generated types.

## Testing Guidelines

Vitest covers unit, integration, and benchmarks. Name specs `*.test.ts` under `src/__tests__/` or `tests/` so they match the `vitest.config.ts` include glob. Use `pnpm --filter @cogniformai/instructor-stream run test:watch` while iterating and `pnpm --filter @cogniformai/instructor-stream run test:integration` only when provider API keys are available in `.secrets` (see `.secrets.example`). Coverage reports land in `coverage/`; avoid checking them in unless intentionally updating artifacts.

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
   - `pnpm publish --filter @cogniformai/instructor-stream --access public`
6. **Post-publish**
   - Draft GitHub release notes (copy from CHANGELOG)
   - Announce internally if needed

# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in .agent/PLANS.md) from design to implementation.

# Effect Migration

- Take advantage of Typescript, for easier itteration. This will help find small errors throught the codebase.
- DO NOT worry about backwards compatibilty and by this I mean I dont want half the code in one runtime and half in another, If we are going to migrate this to Effect, then its go big or go home. I want this to be using the Effect runtime and all of its built-ins where possible.

NOTE: Effect documentation lives under `.agents/ref_docs/effect-docs` (see `.agents/ref_docs/README.md` for entry points).
