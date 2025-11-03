# Benchmarks

This package contains performance benchmarks for the streaming JSON parser and update strategy.

## What we measure

- Update strategy over large assignment workloads:
  - In-place `setDeep` (mutates objects/arrays) vs Ramda `set` (immutable copies)
- Tokenizer behavior (buffered vs non-buffered, newlines, chunk sizes)
- End-to-end `SchemaStream.parse` performance (single and concurrent streams)

## Quick run (non-watch)

- Vitest benchmark (default ~5s per case):

  ```bash
  pnpm -C packages/benchmarks run bench:ci
  ```

- Longer run (e.g. ~15s per case):

  ```bash
  pnpm -C packages/benchmarks run bench:long
  ```

- Simple table output (tinybench):

  ```bash
  pnpm -C packages/benchmarks run bench:simple
  # Custom duration
  BENCH_TIME=15000 pnpm -C packages/benchmarks run bench:simple
  ```

- LangGraph adapter baseline (reads 4k-line JSONL fixture):

  ```bash
  pnpm -C packages/benchmarks run bench:langgraph
  # Longer sample window
  BENCH_TIME=10000 pnpm -C packages/benchmarks run bench:langgraph
  ```

  A typical laptop run processes the 4,096 envelope fixture in roughly 30 ms (≈130k envelopes/sec).

## Interpreting results

- The tinybench table prints:
  - `hz`: operations per second (higher is better)
  - `mean`, `min`, `max`: time per run (ms)
  - `samples`: individual timings collected
- Example (typical on a laptop):
  - In-place `setDeep` ≈ 300–400 hz
  - Ramda `set` ≈ 15–25 hz
  - This indicates ~10–20x speedup for in-place updates over immutable copies in large JSON workloads.

## Notes

- Benchmarks are synthetic but representative of real streaming behavior (thousands of key assignments).
- The parser/tokenizer are exercised with chunked input to simulate streaming boundaries.
- Use longer durations (e.g. `BENCH_TIME=30000`) when comparing across machines or CI.
