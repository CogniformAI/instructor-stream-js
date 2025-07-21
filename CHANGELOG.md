# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial fork of instructor-js with streaming-first focus
- Comprehensive development plan (PLAN.md) outlining roadmap
- Repository cleanup documentation (CLEANUP.md)
- New streaming data format design: `{ data: T[], _meta }`
- Integration of Island AI packages (zod-stream, schemaStream, llm-client) as internal dependencies

### Changed

- Package name from `@instructor-ai/instructor` to `@cogniformai/instructor-stream-js`
- Repository marked as private to prevent accidental publishing
- Version reset to 0.0.0 to indicate development status
- README updated with WIP warning and fork acknowledgments
- Repository URLs updated to point to CogniformAI GitHub organization

### Technical Debt

- [ ] Complete Island AI packages integration
- [ ] Update all imports to use local versions
- [ ] Migrate to Zod 4 with native JSON Schema support
- [ ] Implement new streaming data format
- [ ] Performance optimization (SAX-style parsing)
- [ ] Remove non-streaming modes (MD_JSON, deprecated functions)

## Fork Information

This is a fork of [instructor-js](https://github.com/instructor-ai/instructor-js) by Jason Liu, building on the excellent Island AI toolkit by Dimitri Kennedy.

**Original Project**: https://github.com/instructor-ai/instructor-js  
**Last Sync**: Version 1.7.0 (archived in CHANGELOG.archive.md)  
**Fork Date**: July 20, 2025  
**Fork Purpose**: Streaming-first architecture with performance optimization

### Acknowledgments

Special thanks to:

- **Jason Liu** - Creator of instructor-js and the original Python instructor library
- **Dimitri Kennedy** - Creator of Island AI toolkit that powers the streaming capabilities
- **The instructor-js community** - For their contributions to structured LLM outputs

This fork exists to push the boundaries of streaming performance while honoring their foundational work.
