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
 * AI message chunk with flexible `content` shape:
 * - string
 * - array of { type: 'text', text: string, index?: number }
 */
export const AIMessageChunk = z.object({
  type: z.literal('AIMessageChunk'),
  content: z.union([
    z.string(),
    z.array(
      z.object({
        type: z.literal('text'),
        text: z.string(),
        index: z.number().optional(),
      })
    ),
  ]),
})

/**
 * System/meta record – we only care about `tags`.
 */
export const SystemMeta = z.object({
  tags: z.array(z.string()).default([]),
})

/**
 * LangGraph "messages" envelope with a tuple of [AIMessageChunk, SystemMeta]
 */
export const LangGraphEnvelope = z.object({
  event: z.literal('messages'),
  data: z.tuple([AIMessageChunk, SystemMeta]),
})

export type TLangGraphEnvelope = z.infer<typeof LangGraphEnvelope>

/**
 * Extract the first tag (used as the identifier).
 */
export function extractTags(env: TLangGraphEnvelope): string[] {
  const [, meta] = env.data
  return meta.tags ?? []
}

export type TagSelector = string | ((tags: string[], env: TLangGraphEnvelope) => boolean)

export function hasTag(env: TLangGraphEnvelope, selector: TagSelector): boolean {
  const tags = extractTags(env)
  if (typeof selector === 'string') return tags.includes(selector)
  try {
    return !!selector(tags, env)
  } catch {
    return false
  }
}

/**
 * Normalize the `content` into a single string:
 * - If it's already a string, return as-is.
 * - If it's an array of text parts, sort by index (defensive) and join.
 */
export function extractContent(env: TLangGraphEnvelope): string {
  const [msg] = env.data
  const c = msg.content
  if (typeof c === 'string') return c
  return c
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => p.text)
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

/**
 * Core adapter:
 * - Accepts an AsyncIterable of LangGraph envelopes (already parsed objects)
 * - Filters by `tag`
 * - Feeds ONLY the normalized `content` into SchemaStream(schema)
 * - Yields structured snapshots as they become available
 *
 * Usage:
 * for await (const snapshot of instructorStreamFromLangGraph({
 *   source,
 *   tag: 'profile',
 *   schema: ProfileSchema,
 *   typeDefaults: { string: null }, // optional defaults for partials
 * })) { ... }
 */
export async function* instructorStreamFromLangGraph<T extends z.ZodTypeAny>(params: {
  source: AsyncIterable<unknown>
  tag: TagSelector
  schema: T
  typeDefaults?: {
    string?: string | null
    number?: number | null
    boolean?: boolean | null
  }
}): AsyncGenerator<z.infer<T>> {
  const { source, tag, schema, typeDefaults } = params

  const schemaStream = new SchemaStream(schema, { typeDefaults })
  const transform = schemaStream.parse() // TransformStream<input: string | Iterable<number>, output: Uint8Array>

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

  for await (const raw of source) {
    const parsed = LangGraphEnvelope.safeParse(raw)
    if (!parsed.success) continue

    const env = parsed.data
    if (!hasTag(env, tag)) continue

    const content = extractContent(env)
    if (!content) continue

    await writer.write(content)

    while (true) {
      const dequeued = snapshotQueue.shift()
      if (!dequeued) break
      if (dequeued.done) break
      const value = dequeued.value as z.infer<T>
      yield value as z.infer<T>
    }
  }

  await writer.close()
  for await (const snapshot of snapshotQueue) {
    yield snapshot as z.infer<T>
  }
}

/**
 * Convenience helper to create multiple tag->schema pipelines from one source.
 * Returns a map of async generators keyed by tag.
 *
 * Example:
 * const pipelines = createTaggedPipelines(source, {
 *   profile: ProfileSchema,
 *   business: BusinessSchema,
 * })
 * for await (const s of pipelines.profile) { ... }
 */
export function createTaggedPipelines<TTagSchemas extends Record<string, z.ZodTypeAny>>(
  source: AsyncIterable<unknown>,
  tagSchemas: TTagSchemas,
  typeDefaults?: { string?: string | null; number?: number | null; boolean?: boolean | null }
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
