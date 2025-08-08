---
'@cogniformai/instructor-stream': patch
---

Optimize streaming parser for performance:

- Replace Ramda immutability with in-place deep updates
- Reduce allocations in `BufferedString`/`NonBufferedString`
- Faster path building and fewer callbacks during partial tokens
- Add benchmarking suite and docs
