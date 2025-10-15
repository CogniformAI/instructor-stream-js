/**
 * LangGraph adapter for instructor-stream-js.
 *
 * Focus:
 * - Filter envelopes by a single tag
 * - Extract only the "content" (string or array-of-text parts)
 * - Stream those content tokens through SchemaStream (core)
 * - Yield structured snapshots typed by your Zod schema
 *
 * This integrates with the streaming-first core without caring about provider specifics,
 * since LangGraph already normalizes providers into a common chunk shape.
 */

import { SchemaStream } from '@/utils/streaming-json-parser.ts'
import { z } from 'zod'

/**
 * Describes a single LangGraph content block (text, tool call chunk, image, etc.).
 * Only the fields we rely on are explicitly typed; everything else is accepted through `catchall`.
 */
export const ContentBlock = z
  .object({
    type: z.string(),
    text: z.string().optional(),
    args: z.string().optional(),
    name: z.string().optional(),
    id: z.union([z.string(), z.null()]).optional(),
    index: z.number().optional(),
  })
  .catchall(z.unknown())
export type LangGraphContentBlock = z.infer<typeof ContentBlock>

/**
 * AI message chunk with flexible `content` shape
 */
export const AIMessageChunk = z
  .object({
    type: z.string(),
    content: z.union([z.string(), z.array(ContentBlock)]).optional(),
  })
  .catchall(z.unknown())

/**
 * System/meta record – tags + passthrough metadata.
 */
export const SystemMeta = z
  .object({
    tags: z.array(z.string()).default([]),
    langgraph_node: z.string().optional(),
  })
  .catchall(z.unknown())
export type LangGraphMetadata = z.infer<typeof SystemMeta>

/**
 * LangGraph "messages" envelope with a tuple of [AIMessageChunk, SystemMeta]
 */
export const LangGraphEnvelope = z
  .object({
    event: z.literal('messages'),
    data: z.tuple([AIMessageChunk, SystemMeta]),
  })
  .catchall(z.unknown())

export type TLangGraphEnvelope = z.infer<typeof LangGraphEnvelope>

/**
 * Extract the first tag (used as the identifier).
 */
/**
 * Returns the tags array from a LangGraph envelope, normalising non-array values to an empty list.
 */
export function extractTags(env: TLangGraphEnvelope): string[] {
  const [, meta] = env.data
  const tags = meta.tags
  return Array.isArray(tags) ? tags : []
}

/**
 * Returns the `langgraph_node` metadata value if present.
 */
export function extractNode(env: TLangGraphEnvelope): string | undefined {
  const [, meta] = env.data
  return typeof meta.langgraph_node === 'string' ? meta.langgraph_node : undefined
}

export type TagSelector = string | ((tags: string[], env: TLangGraphEnvelope) => boolean)

/**
 * Tests whether the given envelope matches the selector (string equality or predicate function).
 */
export function hasTag(env: TLangGraphEnvelope, selector: TagSelector): boolean {
  const tags = extractTags(env)
  if (typeof selector === 'string') return tags.includes(selector)
  try {
    return !!selector(tags, env)
  } catch {
    return false
  }
}

type PrimitiveDefaults = {
  string?: string | null
  number?: number | null
  boolean?: boolean | null
}

type ToolDataUnion<TToolSchemas extends Record<string, z.ZodTypeAny>> =
  keyof TToolSchemas extends never ? unknown
  : { [K in keyof TToolSchemas]: z.infer<TToolSchemas[K]> }[keyof TToolSchemas]

export type LangGraphMessageEvent<TData> = {
  kind: 'message'
  identifier: string
  meta: LangGraphMetadata
  tags: string[]
  node?: string
  data: TData
  matchedTag?: string
}

export type LangGraphToolEvent<
  TToolSchemas extends Record<string, z.ZodTypeAny> = Record<string, z.ZodTypeAny>,
> = {
  kind: 'tool'
  identifier: string
  meta: LangGraphMetadata
  tags: string[]
  node?: string
  toolName: string
  toolCallId?: string | null
  data: ToolDataUnion<TToolSchemas>
  rawArgs: string
  matchedTag?: string
}

export type LangGraphStreamEvent<
  TMessageSchema extends z.ZodTypeAny,
  TToolSchemas extends Record<string, z.ZodTypeAny> = Record<string, z.ZodTypeAny>,
> = LangGraphMessageEvent<z.infer<TMessageSchema>> | LangGraphToolEvent<TToolSchemas>

/**
 * Normalize the content union into an array of blocks.
 */
function normalizeContentBlocks(message: z.infer<typeof AIMessageChunk>): LangGraphContentBlock[] {
  const content = message.content
  if (typeof content === 'string') {
    return [
      {
        type: 'text',
        text: content,
      } as LangGraphContentBlock,
    ]
  }
  if (Array.isArray(content)) {
    return content.slice()
  }
  return []
}

/**
 * Normalize the `content` into a single string of concatenated text blocks.
 */
export function extractContent(env: TLangGraphEnvelope): string {
  const [msg] = env.data
  const blocks = normalizeContentBlocks(msg)
  return blocks
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((block) => block.text as string)
    .join('')
}

/**
 * An async queue to bridge the TransformStream readable side to an async generator.
 */
class AsyncQueue<T> implements AsyncIterable<T> {
  private q: T[] = []
  private resolvers: ((v: IteratorResult<T>) => void)[] = []
  private ended = false

  shift(): IteratorResult<T> | null {
    if (this.q.length) return { value: this.q.shift()!, done: false }
    if (this.ended) return { value: undefined as any, done: true }
    return null
  }

  push(value: T) {
    if (this.resolvers.length) this.resolvers.shift()!({ value, done: false })
    else this.q.push(value)
  }
  end() {
    this.ended = true
    while (this.resolvers.length) this.resolvers.shift()!({ value: undefined as any, done: true })
  }
  async next(): Promise<IteratorResult<T>> {
    if (this.q.length) return { value: this.q.shift()!, done: false }
    if (this.ended) return { value: undefined as any, done: true }
    return await new Promise((resolve) => this.resolvers.push(resolve))
  }
  [Symbol.asyncIterator]() {
    return this
  }
}

type ToolParserState = {
  writer: WritableStreamDefaultWriter<string>
  queue: AsyncQueue<unknown>
}

type ToolContext = {
  meta: LangGraphMetadata
  tags: string[]
  node?: string
  toolName: string
  toolCallId?: string | null
}

/**
 * Unified LangGraph event stream.
 *
 * The iterator consumes already-parsed LangGraph envelopes, filters them by the provided selector,
 * and emits a single ordered feed of events that contain either message snapshots or tool-call
 * argument snapshots. Text blocks are streamed through `schema`, tool-call chunks are streamed
 * through the matching schema in `toolSchemas` (or `z.any()` when omitted).
 *
 * Each event also carries the original metadata, the list of tags, and the tag that matched the
 * selector (when the selector is a string), making it easy to route downstream without re-reading
 * the envelope.
 */
export async function* streamLangGraphEvents<
  TMessageSchema extends z.ZodTypeAny,
  TToolSchemas extends Record<string, z.ZodTypeAny> = Record<string, z.ZodTypeAny>,
>(params: {
  source: AsyncIterable<unknown>
  tag: TagSelector
  schema: TMessageSchema
  toolSchemas?: TToolSchemas
  typeDefaults?: PrimitiveDefaults
  toolTypeDefaults?: PrimitiveDefaults
}): AsyncGenerator<LangGraphStreamEvent<TMessageSchema, TToolSchemas>> {
  const { source, tag, schema, toolSchemas, typeDefaults, toolTypeDefaults } = params

  const schemaStream = new SchemaStream(schema, { typeDefaults })
  const transform = schemaStream.parse()
  const writer = transform.writable.getWriter()
  const reader = transform.readable.getReader()
  const decoder = new TextDecoder()

  const snapshotQueue = new AsyncQueue<unknown>()
  ;(async () => {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        snapshotQueue.push(JSON.parse(decoder.decode(value)))
      }
    } finally {
      snapshotQueue.end()
    }
  })()

  const configuredToolSchemas = (toolSchemas ?? {}) as Record<string, z.ZodTypeAny>
  const toolDefaults = toolTypeDefaults ?? typeDefaults
  const toolParsers = new Map<string, ToolParserState>()
  const toolContexts = new Map<string, ToolContext>()
  const toolRawBuffers = new Map<string, string>()

  const ensureToolParser = (key: string, toolName: string): ToolParserState => {
    if (toolParsers.has(key)) {
      return toolParsers.get(key)!
    }
    const schemaForTool = configuredToolSchemas[toolName] ?? z.any()
    const toolStream = new SchemaStream(schemaForTool, { typeDefaults: toolDefaults })
    const transform = toolStream.parse()
    const writer = transform.writable.getWriter()
    const reader = transform.readable.getReader()
    const decoder = new TextDecoder()
    const queue = new AsyncQueue<unknown>()
    ;(async () => {
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          queue.push(JSON.parse(decoder.decode(value)))
        }
      } finally {
        queue.end()
      }
    })()
    const state: ToolParserState = { writer, queue }
    toolParsers.set(key, state)
    return state
  }

  let lastMessageContext: {
    meta: LangGraphMetadata
    tags: string[]
    node?: string
    identifier: string
    matchedTag?: string
  } | null = null

  for await (const raw of source) {
    const parsed = LangGraphEnvelope.safeParse(raw)
    if (!parsed.success) continue

    const env = parsed.data
    if (!hasTag(env, tag)) continue

    const [message, meta] = env.data
    const blocks = normalizeContentBlocks(message)
    if (blocks.length === 0) continue

    const tags = extractTags(env)
    const node = extractNode(env)
    const matchedTag = typeof tag === 'string' && tags.includes(tag) ? tag : undefined
    const messageIdentifier = matchedTag ?? node ?? tags[0] ?? 'unknown'

    for (const block of blocks) {
      if (block.type === 'text' && typeof block.text === 'string') {
        lastMessageContext = { meta, tags, node, identifier: messageIdentifier, matchedTag }
        await writer.write(block.text)

        while (true) {
          const dequeued = snapshotQueue.shift()
          if (!dequeued) break
          if (dequeued.done) break
          const value = dequeued.value as z.infer<TMessageSchema>
          yield {
            kind: 'message',
            identifier: messageIdentifier,
            meta,
            tags,
            node,
            data: value,
            matchedTag,
          }
        }
        continue
      }

      if (block.type === 'tool_call_chunk') {
        const fallbackId = typeof block.id === 'string' && block.id.length > 0 ? block.id : 'tool'
        const toolName = block.name ?? fallbackId
        const toolKey = block.id ?? toolName
        const parser = ensureToolParser(toolKey, toolName)
        const argsChunk = block.args ?? ''
        if (argsChunk) {
          toolRawBuffers.set(toolKey, (toolRawBuffers.get(toolKey) ?? '') + argsChunk)
          await parser.writer.write(argsChunk)
        }

        toolContexts.set(toolKey, {
          meta,
          tags,
          node,
          toolName,
          toolCallId: block.id ?? null,
        })

        while (true) {
          const dequeued = parser.queue.shift()
          if (!dequeued) break
          if (dequeued.done) break
          yield {
            kind: 'tool',
            identifier: toolName,
            meta,
            tags,
            node,
            toolName,
            toolCallId: block.id ?? null,
            rawArgs: toolRawBuffers.get(toolKey) ?? '',
            data: dequeued.value as ToolDataUnion<TToolSchemas>,
            matchedTag,
          }
        }
      }
    }
  }

  await writer.close()
  if (lastMessageContext) {
    for await (const snapshot of snapshotQueue) {
      yield {
        kind: 'message',
        identifier: lastMessageContext.identifier,
        meta: lastMessageContext.meta,
        tags: lastMessageContext.tags,
        node: lastMessageContext.node,
        data: snapshot as z.infer<TMessageSchema>,
        matchedTag: lastMessageContext.matchedTag,
      }
    }
  } else {
    // Drain without emitting if there was never any matching content.
    for await (const _ of snapshotQueue) {
      // noop
    }
  }

  for (const parser of toolParsers.values()) {
    await parser.writer.close()
  }

  for (const [toolKey, parser] of toolParsers.entries()) {
    const context = toolContexts.get(toolKey)
    if (!context) continue
    for await (const snapshot of parser.queue) {
      yield {
        kind: 'tool',
        identifier: context.toolName,
        meta: context.meta,
        tags: context.tags,
        node: context.node,
        toolName: context.toolName,
        toolCallId: context.toolCallId ?? null,
        rawArgs: toolRawBuffers.get(toolKey) ?? '',
        data: snapshot as ToolDataUnion<TToolSchemas>,
        matchedTag: typeof tag === 'string' && context.tags.includes(tag) ? tag : undefined,
      }
    }
  }
}

/**
 * Backwards-compatible helper that only yields message snapshots typed by `schema`.
 *
 * Internally delegates to `streamLangGraphEvents` and filters out tool-call events so existing
 * consumers can continue to treat the adapter as a simple schema stream.
 */
export async function* instructorStreamFromLangGraph<T extends z.ZodTypeAny>(params: {
  source: AsyncIterable<unknown>
  tag: TagSelector
  schema: T
  typeDefaults?: PrimitiveDefaults
}): AsyncGenerator<z.infer<T>> {
  const { source, tag, schema, typeDefaults } = params
  for await (const event of streamLangGraphEvents({
    source,
    tag,
    schema,
    typeDefaults,
  })) {
    if (event.kind !== 'message') continue
    yield event.data as z.infer<T>
  }
}

/**
 * Convenience helper to create multiple tag->schema pipelines from a single LangGraph source.
 *
 * Each registered tag gets its own async generator of message snapshots. The dispatcher reads the
 * source once and fans out matching envelopes to the queues, so you can independently consume each
 * tag without duplicating work or buffering the full stream.
 */
export function createTaggedPipelines<TTagSchemas extends Record<string, z.ZodTypeAny>>(
  source: AsyncIterable<unknown>,
  tagSchemas: TTagSchemas,
  typeDefaults?: PrimitiveDefaults
): { [K in keyof TTagSchemas]: AsyncGenerator<z.infer<TTagSchemas[K]>> } {
  const entries = Object.entries(tagSchemas) as Array<[keyof TTagSchemas, z.ZodTypeAny]>
  const queueMap = new Map<string, AsyncQueue<TLangGraphEnvelope>>()

  const pipelines = {} as { [K in keyof TTagSchemas]: AsyncGenerator<z.infer<TTagSchemas[K]>> }

  for (const [tagKey, schema] of entries) {
    const tag = String(tagKey)
    const queue = new AsyncQueue<TLangGraphEnvelope>()
    queueMap.set(tag, queue)
    pipelines[tagKey] = instructorStreamFromLangGraph({
      source: queue,
      tag,
      schema: schema as TTagSchemas[typeof tagKey],
      typeDefaults,
    }) as AsyncGenerator<z.infer<TTagSchemas[typeof tagKey]>>
  }

  if (queueMap.size === 0) {
    return pipelines
  }

  const endAll = () => {
    for (const queue of queueMap.values()) {
      queue.end()
    }
  }

  ;(async () => {
    try {
      for await (const raw of source) {
        const parsed = LangGraphEnvelope.safeParse(raw)
        if (!parsed.success) continue

        const env = parsed.data
        const tags = extractTags(env)
        if (tags.length === 0) continue

        for (const tag of tags) {
          const queue = queueMap.get(tag)
          if (!queue) continue
          queue.push(env)
        }
      }
    } catch (err) {
      console.error('Error while dispatching LangGraph envelopes by tag', err)
    } finally {
      endAll()
    }
  })()

  return pipelines
}
