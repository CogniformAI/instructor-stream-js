# Repository Cleanup Phase

This document tracks the immediate cleanup tasks to prepare the instructor-stream-js repository for development.

## Overview

This cleanup phase prepares our fork of instructor-js for the larger refactoring work outlined in PLAN.md. The focus is on:

1. Making it clear this is a development fork, not the original package
2. Preventing accidental publishing
3. Properly crediting original work
4. Cleaning up outdated content
5. Establishing the new project structure

## Cleanup Tasks

### ✅ Completed Tasks

- [x] **Created PLAN.md** - Comprehensive long-term development roadmap
- [x] **Created CLEANUP.md** - This document tracking immediate cleanup
- [x] **Mark package.json as private** - Added `"private": true` to prevent accidental publishing
- [x] **Reset version** - Changed to `"version": "0.0.0"` to indicate development status
- [x] **Update package name** - Changed to `@cogniform/instructor-stream-js`
- [x] **Update repository URLs** - Point to CogniformAI GitHub account
- [x] **Archive current CHANGELOG** - Renamed to `CHANGELOG.archive.md`
- [x] **Create fresh CHANGELOG.md** - Started with initial fork entry
- [x] **Update .gitignore** - Added exclusions for new structure
- [x] **Update tsconfig.json** - Added path mappings for core packages
- [x] **Clean examples directory** - Removed outdated examples, kept streaming-focused ones
- [x] **Clean docs directory** - Removed blog posts and outdated documentation
- [x] **Update README.md** - Added WIP warning and fork acknowledgments

### ⏳ Next Phase Tasks (Phase 1: Core Modernization)

- [ ] **Complete Island AI packages integration** - Fix imports and path references
- [ ] **Update all imports to use local versions** - Remove external dependencies
- [ ] **Migrate to Zod 4** - Replace `zod-to-json-schema` with native support
- [ ] **Implement new streaming data format** - `{ data: T[], _meta }` structure
- [ ] **Remove non-streaming modes** - Clean up MD_JSON and deprecated functions

## Project Structure Changes

### Current Structure (Original instructor-js)
```
src/
├── index.ts
├── instructor.ts
├── lib/
└── types/
```

### New Structure (After Island AI Integration)
```
src/
├── core/
│   ├── schema-stream/     # Internalized from Island AI
│   └── zod-stream/        # Internalized from Island AI
├── providers/
│   └── llm-client/        # Internalized from Island AI
├── index.ts
├── instructor.ts
├── lib/
└── types/
```

### Staged Changes
The following Island AI packages have been staged and integrated:
- `src/core/schema-stream/` - JSON streaming parser with Zod schema validation
- `src/core/zod-stream/` - LLM stream interface with mode handling
- `src/providers/llm-client/` - Multi-provider LLM client (anthropic, google, openai)

## Important Notes

### Attribution & Credit
- Always acknowledge Jason Liu (original instructor-js creator)
- Always acknowledge Dimitri Kennedy (Island AI toolkit creator)
- Maintain MIT license with proper attribution
- Make fork status clear in all documentation

### Breaking Changes
- This fork will introduce breaking changes from original instructor-js
- Version will start at 0.0.0 to indicate pre-release status
- Migration guide will be provided when reaching 1.0

### Development Focus
- Streaming-first approach
- Performance optimization
- Modern dependency management (Zod 4)
- Clean data/metadata separation
- Real-time UI integration

## Next Steps After Cleanup

1. **Phase 1: Core Modernization**
   - Zod 4 migration
   - Data shape restructuring
   - Mode consolidation

2. **Phase 2: Performance Optimization**
   - Tokenizer performance improvements
   - XML streaming support
   - Memory optimization

3. **Phase 3: Modern Transport & Integration**
   - WebSocket native support
   - Agentic response handling
   - OpenAI Responses API integration

See PLAN.md for complete development roadmap.

## Verification Checklist

After completing cleanup tasks, verify:

- [ ] `npm publish` fails due to private flag
- [ ] README clearly indicates WIP status
- [ ] All examples work with new structure
- [ ] Build process succeeds
- [ ] TypeScript compilation passes
- [ ] Original contributors are credited
- [ ] License is properly maintained

## Contact

This cleanup is being performed as part of the CogniformAI product development process. The goal is to create a production-ready streaming instructor library while maintaining proper attribution to original creators.