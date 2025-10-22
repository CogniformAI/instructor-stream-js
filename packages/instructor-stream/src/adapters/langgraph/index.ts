import { langgraphAdapter } from '@/stream/adapters/langgraph-adapter.ts'
import { consumeLanggraphChannels, type ChannelSpec } from '@/stream/channels.ts'

/**
 * Convert an (async) iterable of envelope objects into a WHATWG ReadableStream.
 * LangGraph runtimes commonly expose async generators; this helper makes them
 * compatible with `consumeLanggraphChannels`.
 */
export function iterableToReadableStream<T>(
  source: AsyncIterable<T> | Iterable<T>
): ReadableStream<T> {
  const iterator =
    Symbol.asyncIterator in source ?
      (source as AsyncIterable<T>)[Symbol.asyncIterator]()
    : (async function* () {
        for (const item of source as Iterable<T>) {
          yield item
        }
      })()

  return new ReadableStream<T>({
    async pull(controller) {
      const { value, done } = await iterator.next()
      if (done) {
        controller.close()
      } else {
        controller.enqueue(value as T)
      }
    },
    async cancel() {
      if (typeof iterator.return === 'function') {
        await iterator.return()
      }
    },
  })
}

export { langgraphAdapter, consumeLanggraphChannels }
export type { ChannelSpec }
