---
"@cogniformai/instructor-stream": patch
"@instructor-stream/llm-client": patch
---

Initial release of instructor-stream-js

This is the first release of the streaming-first structured data extraction library, featuring:

- Real-time structured data extraction from LLMs with `{ data: T[], _meta }` format
- Clean separation of data and metadata in streaming responses  
- Modern dependency management with Zod 4 and internalized packages
- Performance optimization for production streaming applications
- Support for OpenAI, Anthropic, and other LLM providers via universal client interface