# instructor-stream-js: Comprehensive Development Plan

A streaming-first fork of instructor-js focused on performance, modern APIs, and real-time structured data extraction.

## Project Overview

This fork of instructor-js addresses key limitations in the original project while building on the excellent foundation created by Jason Liu and the Island AI toolkit by Dimitri Kennedy. Our focus is on creating a streaming-first library that delivers structured LLM outputs with minimal latency and maximum developer experience.

### Key Motivations

1. **Streaming Performance**: Original instructor-js has limited streaming capabilities and mixes data with metadata
2. **Modern Dependencies**: Upgrade to Zod 4 and remove deprecated dependencies like `zod-to-json-schema`
3. **Data Shape Clarity**: Separate data from metadata in streaming responses for cleaner consumption
4. **Vendor Independence**: Internalize critical dependencies to ensure control over the core streaming logic
5. **OpenAI API Evolution**: Adapt to OpenAI's new Responses API while maintaining broader provider support

## Development Phases

### Phase 0: Bootstrap & Foundation ✅ _Completed_

**Goal**: Clean repository and establish development foundation

#### 0.0 - Repository Cleanup ✅ _Completed_

- [x] Mark package as private to prevent accidental publishing
- [x] Reset version to 0.0.0 and update package name
- [x] Archive old documentation and examples
- [x] Update README with WIP warning and acknowledgments
- [x] Establish project structure with internalized dependencies

#### 0.1 - Core Dependencies Integration ✅ _Completed_

- [x] Fully integrate Island AI packages (`zod-stream`, `schemaStream`, `llm-client`)
- [x] Update all imports to use local versions
- [x] Remove external dependency references
- [x] Verify build system works with new structure
- [x] Switch to PNPM workspaces from Bun

### Phase 1: Core Modernization ✅ _Completed_

**Goal**: Upgrade dependencies and implement new data structures

#### 1.0 - Zod 4 Migration ✅ _Completed_

- [x] Replace `zod-to-json-schema` with Zod 4's native `.toJSONSchema()`
- [x] Update all Zod type handling for Zod 4 changes
- [x] Remove deprecated API usage (e.g., `invalid_type_error`, `required_error`)
- [x] Leverage Zod 4 performance improvements (3x faster parsing, 57% smaller bundle)

#### 1.1 - Data Shape Restructuring ✅ _Completed_

- [x] Implement new streaming format: `{ data: T[], _meta: CompletionMeta }`
- [x] Add dynamic `_type` field to metadata (`'outline' | 'detailed' | 'complete' | 'error'`)
- [x] Preserve `_completedPaths` and `_activePath` in metadata
- [x] Fix validation system to work with new data structure
- [x] Ensure backward compatibility documentation for migration

#### 1.2 - Validation System Integration ✅ _Completed_

- [x] Integrate LLM-based validators for content validation
- [x] Integrate OpenAI moderation validators
- [x] Fix core validation bug in instructor.ts
- [x] Update unit tests for new message formats
- [x] Verify integration tests pass with real API calls

#### 1.3 - Mode Consolidation _Deferred_

- [ ] Remove non-streaming modes (MD_JSON, deprecated function calling)
- [ ] Unify to two core modes: `tools()` for function calling, `structured()` for JSON/XML
- [ ] Clean up mode-specific code and simplify API surface

### Phase 2: Performance Optimization (Current)

**Goal**: Implement high-performance streaming parser

#### 2.0 - Tokenizer Performance

- [ ] Implement SAX-style state machine for JSON parsing
- [ ] Minimize string creation and concatenation in parsing loops
- [ ] Use direct value recognition for JSON literals (`true`, `false`, `null`)
- [ ] Optimize chunk boundary handling with persistent TextDecoder
- [ ] Avoid accumulating entire JSON in memory during parsing

#### 2.1 - XML Streaming Support

- [ ] Research and implement XML tag-based streaming (Anthropic-style)
- [ ] Create JSON Schema → XML format converter
- [ ] XML response → JSON data parser
- [ ] Benchmark XML vs JSON streaming performance

#### 2.2 - Memory & Performance Profiling

- [ ] Create benchmarks against `stream-json`, `clarinet`, other parsers
- [ ] Profile memory usage and garbage collection patterns
- [ ] Optimize for linear parsing time with stable memory usage

### Phase 3: Modern Transport & Integration

**Goal**: Embrace modern web standards and interleaved responses

#### 3.0 - WebSocket Native Support

- [ ] Implement WebSocket-first transport layer
- [ ] SSE fallback for compatibility
- [ ] Framework-agnostic client hooks (`useStream`, etc.)
- [ ] Cross-platform compatibility (Node, Cloudflare Workers, Vercel)

#### 3.1 - Agentic Response Handling

- [ ] Support interleaved text and tool call responses
- [ ] Automatic tool call result feeding back to LLM
- [ ] Plain text streaming in JSON wrapper for easy client handling
- [ ] Tool call callback system

#### 3.2 - OpenAI Responses API Integration

- [ ] Adapt to use OpenAI's new structured output endpoints
- [ ] Maintain streaming capabilities that official SDK lacks
- [ ] Preserve rich metadata that official API doesn't provide

### Phase 4: Client-Side & UI Integration

**Goal**: Complete the streaming experience with client tooling

#### 4.0 - Framework-Agnostic Hooks

- [ ] Platform-agnostic streaming hooks using UnJS ecosystem
- [ ] WebSocket-native with automatic fallbacks
- [ ] Tree-shakeable design for minimal bundle impact

#### 4.1 - Dynamic UI Exploration

- [ ] JSON-based UI specification generation
- [ ] Framework examples (React, Vue, Svelte) without lock-in
- [ ] Real-time form generation from streaming schemas

### Phase 5: Validator Plugin System

**Goal**: Remove hard dependency on Zod

#### 5.0 - Pluggable Validation

- [ ] Create `Validator<T>` adapter interface
- [ ] Built-in adapters: `fromZod`, `fromValibot`, `fromArktype`, `fromJSONSchema`
- [ ] Allow users to bring their own validation library
- [ ] Maintain Zod as default but not required

### Phase 6: Advanced Features

**Goal**: Cutting-edge capabilities

#### 6.0 - Media Stream Handling

- [ ] Native image/video streaming support
- [ ] Binary chunk passthrough with progressive assembly
- [ ] Automatic base64 → blob conversion

#### 6.1 - Advanced Optimizations

- [ ] WASM tokenizer experiments
- [ ] Automatic JSON ↔ XML fallback based on model quality
- [ ] Pluggable post-merge transformers

## Release Strategy

### Version 0.x (Pre-Release)

- Private development releases
- Breaking changes allowed
- Focus on core functionality and performance

### Version 1.0 (Stable Release)

- Public release with API freeze
- Comprehensive documentation site
- GitHub Actions with semantic release
- Browser + Node bundles
- Migration guide from instructor-js

### Post-1.0 Roadmap

- Community feedback integration
- Additional provider support
- Advanced UI generation features
- Performance optimizations based on real-world usage

## Acknowledgments

This project builds on excellent work by:

- **Jason Liu** - Creator of the original instructor Python and JavaScript packages
- **Dimitri Kennedy** - Creator of Island AI toolkit including zod-stream and schemaStream
- **Colin McDonnell** - Creator of Zod validation library
- **The community** - For their contributions to the above projects

This fork exists to push the boundaries of streaming structured outputs while honoring the foundational work that made it possible.

## Contributing

This is currently a private fork under active development. Once we reach version 1.0, we plan to open-source the project and welcome community contributions.

For now, development is focused on achieving the roadmap milestones and ensuring the library meets our streaming performance and developer experience goals.
