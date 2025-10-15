# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2025-10-15

### Fixed

- Normalise LangGraph content block indices so string-based values such as `lc_txt_0` are ordered and streamed correctly.

## [0.2.0] - 2025-10-15

### Added

- `streamLangGraphEvents` API for unified message/tool streaming in the LangGraph adapter
- Unit coverage for multi-tag content blocks and incremental tool-call args (`stream-events.test.ts`)

### Changed

- Normalised LangGraph tuple schema enums to open-ended `catchall` structures to match provider variability
- Updated LangGraph adapter to surface `matchedTag`, prefer subscribed tags for identifiers, and stream tool args progressively

### Added

- ✅ Initial fork of instructor-js with streaming-first focus
- ✅ Comprehensive development plan (PLAN.md) outlining roadmap
- ✅ Repository cleanup documentation (CLEANUP.md)
- ✅ New streaming data format implementation: `{ data: T[], _meta }`
- ✅ Integration of Island AI packages (zod-stream, schemaStream, llm-client) as internal dependencies
- ✅ LLM-based validation system with `LLMValidator`
- ✅ OpenAI moderation validation system with `moderationValidator`
- ✅ PNPM workspaces for improved dependency management
- ✅ Integration tests for validator system
- ✅ Fixed core validation bug in streaming responses

### Changed

- ✅ Package name from `@instructor-ai/instructor` to `@cogniformai/instructor-stream-js`
- ✅ Repository marked as private to prevent accidental publishing
- ✅ Version reset to 0.0.0 to indicate development status
- ✅ README updated with WIP warning and fork acknowledgments
- ✅ Repository URLs updated to point to CogniformAI GitHub organization
- ✅ Migrated to Zod 4 with native JSON Schema support (removed `zod-to-json-schema`)
- ✅ Updated all imports to use local versions of Island AI packages
- ✅ Fixed validation system to properly validate `data[0]` instead of wrapper object
- ✅ Updated unit tests to match current implementation

### Fixed

- ✅ Critical validation bug where schemas were validating wrapper object instead of actual data
- ✅ Validator unit tests to match current message format and model references
- ✅ Integration tests to properly apply validators using `.superRefine()`
- ✅ Response parsing to correctly extract structured data from LLM responses
- ✅ Use Zod 4 public API (`addIssue`) for custom validations, replacing internal `issues.push`

### Technical Debt (Next Phase)

- [ ] Performance optimization (SAX-style parsing, memory management)
- [ ] Remove non-streaming modes (MD_JSON, deprecated functions)
- [ ] WebSocket-native transport layer
- [ ] XML streaming support for Anthropic-style responses
- [ ] Framework-agnostic client hooks

## Fork Information

This is a fork of [instructor-js](https://github.com/instructor-ai/instructor-js) by Jason Liu, building on the excellent Island AI toolkit by Dimitri Kennedy.

**Original Project**: https://github.com/instructor-ai/instructor-js  
**Last Sync**: Version 1.7.0 (archived in CHANGELOG.archive.md)  
**Fork Date**: July 27, 2025  
**Fork Purpose**: Streaming-first architecture with performance optimization

### Major Milestones Completed

**Phase 0: Bootstrap & Foundation** ✅ _Completed July 27, 2025_

- Repository cleanup and project structure establishment
- Island AI packages integration
- PNPM workspaces migration

**Phase 1: Core Modernization** ✅ _Completed July 28, 2025_

- Zod 4 migration with native JSON Schema support
- New streaming data format: `{ data: T[], _meta: CompletionMeta }`
- Validation system integration (LLM + moderation validators)
- Critical validation bug fixes for streaming responses

### Acknowledgments

Special thanks to:

- **Jason Liu** - Creator of instructor-js and the original Python instructor library
- **Dimitri Kennedy** - Creator of Island AI toolkit that powers the streaming capabilities
- **The instructor-js community** - For their contributions to structured LLM outputs

This fork exists to push the boundaries of streaming performance while honoring their foundational work.
