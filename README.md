# instructor-stream-js

_Streaming-first structured extraction in TypeScript, powered by LLMs, designed for real-time performance and developer experience._

---

> **⚠️ WORK IN PROGRESS ⚠️**
>
> This is a development fork of instructor-js focused on streaming performance and modern APIs. **This package is not ready for production use** and will have breaking changes.
>
> If you need a stable instructor package, please use the original [@instructor-ai/instructor](https://www.npmjs.com/package/@instructor-ai/instructor).

## About This Fork

This project is a **streaming-first fork** of the excellent [instructor-js](https://github.com/instructor-ai/instructor-js) library, created to address specific needs around:

- **Real-time streaming performance** with minimal latency
- **Clean data/metadata separation** in streaming responses
- **Modern dependency management** (Zod 4, internalized critical dependencies)
- **Enhanced developer experience** for streaming applications

### Acknowledgments

This work builds on the outstanding foundations created by:

- **[Jason Liu](https://github.com/jxnl)** - Creator of the original instructor Python and JavaScript libraries
- **[Dimitri Kennedy](https://github.com/dimitrikennedy)** - Creator of the Island AI toolkit (zod-stream, schemaStream, llm-client) that powers the streaming capabilities
- **The instructor-js team** - For their excellent work on structured LLM outputs

We're grateful for their pioneering work in structured LLM extraction and streaming. This fork exists to push the boundaries of real-time streaming performance while honoring their contributions.

## Current Status

- ✅ Repository cleanup and fork setup
- ✅ Island AI packages integration (zod-stream, schemaStream, llm-client)
- ✅ Zod 4 migration and dependency modernization
- ✅ New streaming data format implementation
- ✅ PNPM workspaces migration
- ✅ Validation system integration (LLM + moderation)
- ✅ Effect runtime migration and adapter architecture (v0.5.0)
- ⏳ Performance optimization and benchmarking

See [PLAN.md](docs/roadmap/PLAN.md) for the complete development roadmap.

## Architecture (v0.5.0)

The library now uses a clean adapter architecture:

- **Core Effect Runtime**: `@cogniformai/instructor-stream` - Main streaming library using Effect for functional error handling
- **LangGraph Adapter**: `@cogniformai/instructor-stream/adapters/langgraph` - Adapter for LangGraph streaming format

The LangGraph adapter has been moved to `src/adapters/langgraph/` for better organization. Examples are now located in the root `examples/` directory.

## Quick TODO List

- [x] Complete Island AI packages integration
- [x] Implement new `{ data: T[], _meta }` streaming format
- [x] Migrate to Zod 4 with native JSON Schema support
- [x] Switch to PNPM workspaces from Bun
- [x] Fix validation system (LLM + moderation validators)
- [ ] Performance optimization (SAX-style parsing, memory management)
- [ ] WebSocket-native transport layer
- [ ] Framework-agnostic client hooks
- [ ] Documentation and examples cleanup

## Installation

> **Note**: This package is not yet published. For production use, install the original instructor-js:

```bash
npm i @instructor-ai/instructor zod openai
```

## Development Status

This fork is in active development. Current API is similar to instructor-js but **will change significantly** as we implement the streaming-first architecture.

### Example Usage (Current - Will Change)

```typescript
import Instructor from '@cogniformai/instructor-stream-js'
import OpenAI from 'openai'
import { z } from 'zod'

// API similar to original instructor-js for now
const client = Instructor({
  client: new OpenAI(),
  mode: 'TOOLS',
})

const UserSchema = z.object({
  age: z.number().describe('The age of the user'),
  name: z.string(),
})

// Streaming extraction with enhanced metadata
const stream = await client.chat.completions.create({
  messages: [{ role: 'user', content: 'Jason Liu is 30 years old' }],
  model: 'gpt-4.1-mini',
  response_model: { schema: UserSchema, name: 'User' },
  stream: true,
})

for await (const chunk of stream) {
  // New format: { data: T[], _meta: { _type, _completedPaths, _activePath } }
  console.log(chunk.data) // Clean data without metadata pollution
  console.log(chunk._meta._type) // 'name' | 'age' | 'complete' | 'error'
}
```

## Why This Fork?

### Problems with Original instructor-js

1. **Limited Streaming**: Metadata mixed with data, poor real-time performance
2. **Outdated Dependencies**: Uses deprecated `zod-to-json-schema`, missing Zod 4 benefits
3. **Maintenance**: 6+ months between updates, limited active development
4. **Vendor Lock**: External dependencies for core streaming functionality

### Our Solutions ✅

1. **Clean Data Shape**: `{ data: T[], _meta }` separates content from metadata ✅
2. **Modern Stack**: Zod 4 native JSON Schema, internalized dependencies ✅
3. **Validation System**: LLM-based and moderation validators integrated ✅
4. **PNPM Workspaces**: Modern dependency management and build system ✅
5. **Performance First**: SAX-style parsing, memory optimization, WebSocket transport (in progress)

## Development Timeline

See [PLAN.md](docs/roadmap/PLAN.md) for detailed roadmap. Progress:

- **Phase 0**: Repository cleanup and dependency integration ✅ _(completed)_
- **Phase 1**: Zod 4 migration and data shape restructuring ✅ _(completed)_
- **Phase 2**: Performance optimization and XML streaming _(current)_
- **Phase 3**: WebSocket transport and agentic responses
- **Phase 4**: Client-side hooks and dynamic UI

## Performance & Benchmarks

- We replaced Ramda-based immutable updates with in-place mutations in the streaming parser (`SchemaStream`), optimized path building, and reduced string allocations.
- Benchmarks live in `packages/benchmarks`.
- Quick run (non-watch):
  - `pnpm -C packages/benchmarks run bench:ci` (vitest bench)
  - `pnpm -C packages/benchmarks run bench:simple` (tinybench table)
- Typical result on a laptop: in-place `setDeep` is ~10–20x faster than immutable Ramda `set` for large assignment workloads.
- See `packages/benchmarks/README.md` for details and longer runs.

## Contributing

This is currently a private fork under active development for CogniformAI's product needs. Once we reach a stable API (v1.0), we plan to open-source the project.

For questions or collaboration opportunities, please reach out through the repository issues.

## License

This project is licensed under the terms of the MIT License.
