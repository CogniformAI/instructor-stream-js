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
