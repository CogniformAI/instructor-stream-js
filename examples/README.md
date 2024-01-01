# Examples

This directory contains examples demonstrating the streaming capabilities of instructor-stream-js.

> **Note**: These examples are from the original instructor-js and will be updated as we implement the new streaming-first architecture.

## Current Examples

### extract_user_stream/
Demonstrates streaming extraction of user information with real-time updates.

### action_items/
Shows streaming extraction of action items from meeting transcripts.

### knowledge-graph/
Example of streaming knowledge graph construction.

## Coming Soon

As we implement the new `{ data: T[], _meta }` format and enhanced streaming capabilities, these examples will be updated to showcase:

- Clean data/metadata separation
- Dynamic `_type` field usage
- Real-time UI updates
- WebSocket transport
- Framework-agnostic hooks

## Running Examples

```bash
# Install dependencies
npm install

# Run a streaming example
npm run dev examples/extract_user_stream/index.ts
```

For more information on the development roadmap, see [PLAN.md](../PLAN.md).