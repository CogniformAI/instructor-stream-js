<div align="center">
  <h1>@cogniformai/providers</h1>
</div>
<br />

<p align="center"><i>Universal LLM client for instructor-stream with OpenAI-compatible interface</i></p>
<br />

<div align="center">
  <a aria-label="NPM version" href="https://www.npmjs.com/package/@cogniformai/providers">
    <img alt="@cogniformai/providers" src="https://img.shields.io/npm/v/@cogniformai/providers.svg?style=flat-square&logo=npm&labelColor=000000&label=@cogniformai/providers">
  </a>
  <a aria-label="License" href="https://github.com/cogniformai/instructor-stream-js/blob/main/LICENSE">
    <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-000000.svg?style=flat-square&labelColor=000000">
  </a>
  <a aria-label="GitHub" href="https://github.com/cogniformai/instructor-stream-js">
    <img alt="GitHub" src="https://img.shields.io/badge/GitHub-instructor--stream--js-000000.svg?style=flat-square&labelColor=000000&logo=github">
  </a>
</div>

The `@cogniformai/providers` package provides a universal LLM client that extends the OpenAI SDK to offer a consistent interface across different LLM providers. Use the same familiar OpenAI-style API with Anthropic, Google, and others while maintaining compatibility with the instructor-stream ecosystem.

## Features

- **Universal Interface**: Use OpenAI SDK patterns with any supported provider
- **Streaming Support**: Full streaming capabilities across all providers
- **Type Safety**: Complete TypeScript support with proper type inference
- **Tool Calling**: Function/tool calling support where available
- **Consistent Responses**: Normalized response format across providers

## Provider Support

**Native API Support Status:**

| Provider API | Status | Chat | Basic Stream | Functions/Tool calling | Function streaming | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| OpenAI | ✅ | ✅ | ✅ | ✅ | ✅ | Direct SDK proxy |
| Anthropic | ✅ | ✅ | ✅ | ✅ | ✅ | Claude models |
| Google | ✅ | ✅ | ✅ | ✅ | ❌ | Gemini models + context caching |

**OpenAI-Compatible Providers:**

These providers use the OpenAI SDK format and work directly with the OpenAI client configuration:

| Provider   | Configuration                              | Available Models                     |
| ---------- | ------------------------------------------ | ------------------------------------ |
| Together   | Set base URL to Together endpoint          | Mixtral, Llama, OpenChat, Yi, others |
| Anyscale   | Set base URL to Anyscale endpoint          | Mistral, Llama, others               |
| Perplexity | Set base URL to Perplexity endpoint        | pplx-* models                        |
| Replicate  | Set base URL to Replicate endpoint         | Various open models                  |

## Installation

```bash
# Install the providers package
npm install @cogniformai/providers

# Install required peer dependencies
npm install openai  # Always required

# Provider-specific SDKs (install as needed)
npm install @anthropic-ai/sdk      # For Anthropic
npm install @google/generative-ai  # For Google/Gemini
```

## Basic Usage

```typescript
import { createLLMClient } from '@cogniformai/providers'

// Initialize provider-specific client
const client = createLLMClient({
  provider: 'anthropic', // 'openai' | 'anthropic' | 'google'
  apiKey: 'your-api-key', // Optional if set via environment
})

// Use consistent OpenAI-style interface
const completion = await client.chat.completions.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: 'Hello!' }],
  max_tokens: 1000,
})

console.log(completion.choices[0].message.content)
```

## Streaming

```typescript
const stream = await client.chat.completions.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: 'Write a poem about TypeScript' }],
  stream: true,
  max_tokens: 1000,
})

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content
  if (content) {
    process.stdout.write(content)
  }
}
```

## Provider-Specific Usage

### OpenAI

```typescript
const client = createLLMClient({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
})

const completion = await client.chat.completions.create({
  model: 'gpt-4-turbo',
  messages: [{ role: 'user', content: 'Hello!' }],
  max_tokens: 1000,
})
```

### Anthropic

```typescript
const client = createLLMClient({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const completion = await client.chat.completions.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: 'Hello!' }],
  max_tokens: 1000,
})
```

### Google (Gemini)

```typescript
const client = createLLMClient({
  provider: 'google',
  apiKey: process.env.GOOGLE_AI_API_KEY,
})

const completion = await client.chat.completions.create({
  model: 'gemini-1.5-pro',
  messages: [{ role: 'user', content: 'Hello!' }],
  max_tokens: 1000,
})
```

## Function/Tool Calling

```typescript
const completion = await client.chat.completions.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [
    { role: 'user', content: 'What is the weather like in San Francisco?' }
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA'
            }
          },
          required: ['location']
        }
      }
    }
  ],
  tool_choice: 'auto'
})

// Handle tool calls
const toolCall = completion.choices[0].message.tool_calls?.[0]
if (toolCall && toolCall.function.name === 'get_weather') {
  const args = JSON.parse(toolCall.function.arguments)
  // Call your weather function...
}
```

## Configuration Options

```typescript
interface LLMClientConfig {
  provider: 'openai' | 'anthropic' | 'google'
  apiKey?: string           // API key (can also use environment variables)
  baseURL?: string          // Custom base URL for OpenAI-compatible providers
  organization?: string     // OpenAI organization (OpenAI only)
  project?: string          // OpenAI project (OpenAI only)
  defaultHeaders?: Record<string, string>  // Custom headers
  maxRetries?: number       // Max retry attempts (default: 2)
  timeout?: number          // Request timeout in ms (default: 10 minutes)
}
```

## Environment Variables

The client will automatically use these environment variables if no `apiKey` is provided:

- **OpenAI**: `OPENAI_API_KEY`
- **Anthropic**: `ANTHROPIC_API_KEY`
- **Google**: `GOOGLE_AI_API_KEY` or `GEMINI_API_KEY`

## Error Handling

```typescript
import { createLLMClient } from '@cogniformai/providers'

const client = createLLMClient({ provider: 'anthropic' })

try {
  const completion = await client.chat.completions.create({
    model: 'claude-3-5-sonnet-20241022',
    messages: [{ role: 'user', content: 'Hello!' }],
    max_tokens: 1000,
  })
} catch (error) {
  if (error.status === 401) {
    console.error('Authentication failed - check your API key')
  } else if (error.status === 429) {
    console.error('Rate limit exceeded - please retry later')
  } else {
    console.error('Request failed:', error.message)
  }
}
```

## Integration with instructor-stream

This package is designed to work seamlessly with the instructor-stream ecosystem:

```typescript
import { createLLMClient } from '@cogniformai/providers'
import { createInstructor } from '@cogniformai/instructor-stream'
import { z } from 'zod'

const client = createLLMClient({ provider: 'anthropic' })
const instructor = createInstructor(client)

const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
})

const user = await instructor.chat.completions.create({
  model: 'claude-3-5-sonnet-20241022',
  response_model: UserSchema,
  messages: [
    { role: 'user', content: 'Create a user profile for John Doe, age 30' }
  ],
})
```

## TypeScript Support

The package includes full TypeScript support with proper type inference for all providers:

```typescript
import type { ChatCompletion, ChatCompletionChunk } from '@cogniformai/providers'

// Types are automatically inferred based on the streaming parameter
const completion: ChatCompletion = await client.chat.completions.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: false, // ChatCompletion
})

const stream: AsyncIterable<ChatCompletionChunk> = await client.chat.completions.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: true, // ChatCompletionChunk
})
```

## License

MIT © [CogniForm AI](https://github.com/cogniformai)

## Contributing

This package is part of the instructor-stream-js monorepo. Please see the main repository for contribution guidelines.

## Support

- [GitHub Issues](https://github.com/cogniformai/instructor-stream-js/issues)
- [Documentation](https://github.com/cogniformai/instructor-stream-js)