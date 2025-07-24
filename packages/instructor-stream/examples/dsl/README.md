# DSL Integration Examples

This directory contains integration examples that demonstrate real API usage of the DSL functions. These examples require API keys and make actual network calls, unlike the unit tests which use mocks.

## Setup

Before running these examples, you need to set up your OpenAI API credentials:

```bash
export OPENAI_API_KEY="your-api-key-here"
export OPENAI_ORG_ID="your-org-id-here"  # Optional
```

## Examples

### `maybe-integration.ts`

Demonstrates the `maybe` schema wrapper for extraction tasks where data may or may not be present.

**Usage:**
```bash
npx tsx examples/dsl/maybe-integration.ts
```

**Features:**
- Shows successful extraction from clear text
- Demonstrates error handling for ambiguous content
- Complex nested schema extraction

### `validator-integration.ts`

Demonstrates LLM validation and content moderation with real API calls.

**Usage:**
```bash
npx tsx examples/dsl/validator-integration.ts
```

**Features:**
- LLM-based content validation against custom rules
- OpenAI moderation API integration
- Error handling and validation flow examples

## Running Examples

Each example can be run independently:

```bash
# Run maybe examples
npm run tsx examples/dsl/maybe-integration.ts

# Run validator examples
npm run tsx examples/dsl/validator-integration.ts
```

## Testing vs Examples

- **Unit Tests** (`src/dsl/__tests__/`): Fast, reliable tests using mocks
- **Integration Examples** (`examples/dsl/`): Real API demonstrations requiring credentials

The unit tests provide comprehensive coverage of the business logic without API dependencies, while these examples show how the functions work with actual API responses.

## Cost Considerations

These examples make real API calls which may incur costs:
- GPT-4 calls for LLM validation
- Moderation API calls (typically free tier available)
- Token usage varies based on content complexity

Monitor your API usage when running these examples repeatedly.