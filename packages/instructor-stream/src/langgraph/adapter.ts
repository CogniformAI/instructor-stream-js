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
