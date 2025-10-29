type LangGraphEnvelope = {
  data?: unknown
}

type EmittedChunk = {
  node: string
  chunk: string
}

type ContentBlock =
  | {
      type: 'text'
      text?: unknown
      index?: unknown
    }
  | {
      type: 'tool_call_chunk'
      args?: unknown
      index?: unknown
    }

type IndexedFragment = {
  text: string
  index?: number
  order: number
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

const TO_TEXT = (block: ContentBlock): string | undefined => {
  if (block.type === 'text') {
    return typeof block.text === 'string' ? block.text : undefined
  }
  if (block.type === 'tool_call_chunk') {
    return typeof block.args === 'string' ? block.args : undefined
  }
  return undefined
}

const toNumericIndex = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const match = value.match(/(-?\d+)(?!.*\d)/)
    const captured = match?.[1]
    if (captured !== undefined) {
      const parsed = Number.parseInt(captured, 10)
      return Number.isNaN(parsed) ? undefined : parsed
    }
  }
  return undefined
}

const toContentBlock = (raw: unknown): ContentBlock | undefined => {
  if (!isObject(raw) || typeof raw.type !== 'string') {
    return undefined
  }
  if (raw.type === 'text') {
    return raw as ContentBlock
  }
  if (raw.type === 'tool_call_chunk') {
    return raw as ContentBlock
  }
  return undefined
}

const extractNode = (env: LangGraphEnvelope): string | undefined => {
  const records = asArray(env.data)
  for (const entry of records) {
    if (!isObject(entry)) continue
    const node = entry.langgraph_node
    if (typeof node === 'string' && node.length > 0) {
      return node
    }
  }
  return undefined
}
/**
 * Collects and concatenates text fragments from a LangGraph envelope.
 *
 * This function extracts text content from nested data structures within a LangGraph envelope,
 * organizing fragments by their optional index values and original order. Fragments with numeric
 * indices are sorted first by index, then by order of appearance. Fragments without indices
 * appear after indexed fragments, sorted by their order of appearance.
 *
 * @param env - The LangGraph envelope containing data entries with content blocks
 * @returns A single concatenated string of all text fragments in sorted order
 *
 * @remarks
 * The sorting algorithm prioritizes:
 * 1. Fragments with numeric indices (sorted by index, then order)
 * 2. Fragments without indices (sorted by order)
 *
 * Empty or non-string text content is filtered out during processing.
 */
const collectFragments = (env: LangGraphEnvelope): string => {
  const fragments: IndexedFragment[] = []
  let order = 0
  for (const entry of asArray(env.data)) {
    if (!isObject(entry)) continue
    const contents = asArray(entry.content)
    for (const rawBlock of contents) {
      const block = toContentBlock(rawBlock)
      if (!block) continue
      const text = TO_TEXT(block)
      if (typeof text !== 'string' || text.length === 0) continue
      const numericIndex = toNumericIndex(block.index)
      fragments.push({
        text,
        ...(numericIndex !== undefined ? { index: numericIndex } : {}),
        order: order++,
      })
    }
  }
  fragments.sort((a, b) => {
    const aHasIndex = typeof a.index === 'number'
    const bHasIndex = typeof b.index === 'number'
    if (aHasIndex && bHasIndex) {
      const diff = (a.index as number) - (b.index as number)
      return diff !== 0 ? diff : a.order - b.order
    }
    if (aHasIndex) return -1
    if (bHasIndex) return 1
    return a.order - b.order
  })
  return fragments.map((fragment) => fragment.text).join('')
}

/**
 * Creates a TransformStream that adapts LangGraph output into EmittedChunk format.
 *
 * This adapter processes streaming data from LangGraph, extracting node information
 * and associated payload fragments from each chunk. It filters out invalid chunks
 * and only emits well-formed data containing both a node identifier and non-empty payload.
 *
 * @returns A TransformStream that converts LangGraph envelope objects into EmittedChunk objects
 *
 * @remarks
 * The adapter performs the following transformations:
 * - Validates that incoming chunks are objects
 * - Extracts the node identifier from the LangGraph envelope
 * - Collects payload fragments associated with the node
 * - Filters out chunks with empty payloads or invalid node identifiers
 * - Enqueues transformed chunks with both node and payload information
 *
 * @example
 * ```typescript
 * const stream = langgraphStream.pipeThrough(langgraphAdapter());
 * for await (const { node, chunk } of stream) {
 *   console.log(`Node: ${node}, Payload:`, chunk);
 * }
 * ```
 */
export function langgraphAdapter(): TransformStream<unknown, EmittedChunk> {
  return new TransformStream<unknown, EmittedChunk>({
    transform(chunk, controller) {
      if (!isObject(chunk)) {
        return
      }
      const envelope = chunk as LangGraphEnvelope
      const candidate = extractNode(envelope)
      if (!isNonEmptyString(candidate)) {
        return
      }
      const node: string = candidate
      const payload = collectFragments(envelope)
      if (payload.length === 0) {
        return
      }
      controller.enqueue({ node, chunk: payload })
    },
  })
}
