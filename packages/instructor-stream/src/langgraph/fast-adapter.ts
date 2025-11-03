type LangGraphEntry = Record<string, unknown>

export interface LangGraphDelta {
  node: string
  text: string
}

export interface FastAdapterOptions {
  defaultNode?: string
  onMissingNode?: (chunk: unknown) => void
}

const isRecord = (value: unknown): value is LangGraphEntry =>
  typeof value === 'object' && value !== null

const toBlocks = (value: unknown): ReadonlyArray<LangGraphEntry> =>
  Array.isArray(value) ? (value as ReadonlyArray<LangGraphEntry>) : []

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

/**
 * Extract `{ node, text }` deltas from LangGraph SSE tuples without buffering.
 *
 * LangGraph guarantees FIFO ordering across nodes—tokens for a given node arrive
 * in order, but tokens for different nodes can interleave. The adapter preserves
 * tuple order verbatim so downstream consumers can multiplex by node while
 * maintaining per-node ordering.
 */
export const fastAdapter = (
  options: FastAdapterOptions = {}
): TransformStream<unknown, LangGraphDelta> => {
  const { defaultNode = null, onMissingNode } = options
  let missingNodeWarned = false

  return new TransformStream<unknown, LangGraphDelta>({
    transform(chunk, controller) {
      if (!isRecord(chunk)) return
      const entries = Array.isArray(chunk.data) ? (chunk.data as unknown[]) : []
      let fallbackNode: string | null = defaultNode
      let missingNode = false

      for (let index = 0; index < entries.length; index++) {
        const raw = entries[index]
        if (!isRecord(raw)) continue

        const next = entries[index + 1]
        const entryNode = isNonEmptyString(raw.langgraph_node) ? raw.langgraph_node : null
        const upcomingNode =
          isRecord(next) && isNonEmptyString(next.langgraph_node) ? next.langgraph_node : null

        if (entryNode) {
          fallbackNode = entryNode
        } else if (upcomingNode) {
          fallbackNode = upcomingNode
        }

        const node = entryNode ?? fallbackNode
        const blocks = toBlocks(raw.content)
        if (!blocks.length) continue
        if (!node) {
          missingNode = true
          continue
        }

        for (const block of blocks) {
          if (!isNonEmptyString(block.type)) continue
          const text =
            block.type === 'text' && isNonEmptyString(block.text) ? block.text
            : block.type === 'tool_call_chunk' && isNonEmptyString(block.args) ? block.args
            : undefined
          if (!text) continue
          controller.enqueue({ node, text })
        }
      }

      if (missingNode && !missingNodeWarned) {
        missingNodeWarned = true
        if (onMissingNode) {
          onMissingNode(chunk)
        } else {
          console.warn(
            'fastAdapter: dropped LangGraph tuple without `langgraph_node`. Provide `defaultNode` to suppress.',
            chunk
          )
        }
      }
    },
  })
}
