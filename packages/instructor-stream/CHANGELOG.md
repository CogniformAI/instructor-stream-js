# @cogniformai/instructor-stream

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
