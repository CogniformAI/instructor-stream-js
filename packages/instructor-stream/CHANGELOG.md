# @cogniformai/instructor-stream

## 0.5.1

### Patch Changes

- feat: emit `_meta` in streaming snapshots across core runtime, adapters, and tests to keep metadata out of payloads.
- docs: align examples and guidance with the `{ data, _meta }` streaming format.

## 0.4.2

### Patch Changes

- fix: persist string/escape flags on streaming parser contexts so LangGraph snapshots survive chunk boundaries that land inside string literals.
- docs: document that SchemaStream expects websocket frames and clarify SSE caveats.
- chore: add a reusable LangGraph JSONL fixture plus a tinybench harness for fastAdapter + SchemaStream to baseline throughput.

## 0.4.1

### Patch Changes

- refactor: collapse imports to `effect/*` entry points now that the former `@effect/data` and `@effect/schema` packages are redirected.
- docs: adjust README/sample code to use the new import paths.
- chore: regenerate lockfile and build artifacts against consolidated effect packages.

## 0.4.0

### Minor Changes

- Replace the legacy streaming runtime with a single Effect-first pipeline powered by `@effect/ai`. Snapshot hydration now lives under `src/effect/**`, provider I/O flows through Effect services/layers, and LangGraph integration calls into the same hydrator via `@cogniformai/instructor-stream/langgraph`.
- Remove the OAI-specific streaming client, DSL helpers, and legacy error types; shared metadata (`CompletionMeta`) no longer depends on OpenAI-specific usage shapes.
- Consolidate documentation/examples around the Effect API with updated quick-start snippets and LangGraph usage.

## 0.3.2

### Patch Changes

- Default LangGraph channel `failFast` to `false` so parser/snapshot errors are recorded without throwing unless explicitly requested, and ensure channel pipelines collect generator failures without unhandled rejections.

## 0.3.1

### Patch Changes

- Prepare manual release metadata for 0.3.1.

# @cogniformai/instructor-stream

## 0.2.8

### Patch Changes

- Stream LangGraph `tool_call_chunk` args through the same SchemaStream path as text so tool snapshots flush per chunk without extra buffering.

## 0.2.7

### Patch Changes

- Preserve whitespace for streaming LangGraph `tool_call_chunk` args so JSON buffers remain valid across chunks and tool events flush once the payload parses.
- Document the manual release checklist in `AGENTS.md` so the bump → tag → publish flow stays consistent across maintainers.

# @cogniformai/instructor-stream

## 0.2.6

### Patch Changes

- Run `tool_call` content blocks with inline object args through the same schema stream as text chunks and add replay-based regression coverage for Anthropic/OpenAI captures.

## 0.2.5

### Patch Changes

- Quote primitive string tool-call chunks so they parse as JSON, add regression coverage for Anthropic/OpenAI streams, and replay the provider mocks end-to-end to guard against future adapter regressions.

## 0.2.4

### Patch Changes

- Handle LangChain's universal `tool_call` payloads by normalising object args and treating `tool_call`/`tool_call_chunk` blocks uniformly, restoring streaming snapshots for new provider responses.

## 0.2.3

### Patch Changes

- Document manual release flow and disable the CI auto-publish workflow so npm releases for 0.2.x are driven by the documented checklist.

# @cogniformai/instructor-stream

## 0.2.2

### Patch Changes

- Improve LangGraph adapter throughput and memory behaviour for long streams by eliminating queue shift churn, clearing tool parser state, and avoiding repeated string copies for tool-call arguments.
- Accept LangGraph tool chunks with `null` names/ids and ensure mixed tool-call sequences still emit structured events; add a regression test and integrate the mock JSONL stream into the benchmarks.
- Refresh the benchmarking suite with a streaming replay case and clearer console output so future refactors can track structured-output TPS at a glance.

# @cogniformai/instructor-stream

## 0.1.1

### Patch Changes

- Ensure LangGraph adapter is bundled and exported so `@cogniformai/instructor-stream/adapters/langgraph` resolves in released builds.

## 0.1.0

### Minor Changes

- 0e9073d: Add LangGraph adapter with multi-tag queue fan-out, fixtures, and documentation.

## 0.0.6

### Patch Changes

- 331690e: Refactor: route tokenizer/parser errors via hooks (no local try/catch); simplify Error subclasses; streaming parser logs errors; fix Vitest bench usage.

## 0.0.5

### Patch Changes

- abce952: Optimize streaming parser for performance:
  - Replace Ramda immutability with in-place deep updates
  - Reduce allocations in `BufferedString`/`NonBufferedString`
  - Faster path building and fewer callbacks during partial tokens
  - Add benchmarking suite and docs

## 0.0.4

### Patch Changes

- Optimize streaming parser for performance:
  - Replace Ramda immutability with in-place deep updates
  - Reduce allocations in `BufferedString`/`NonBufferedString`
  - Faster path building and fewer callbacks during partial tokens
  - Add benchmarking suite and docs

## 0.0.3

### Patch Changes

- 149461c: Automated patch release to validate Changesets workflow for the main package only.
