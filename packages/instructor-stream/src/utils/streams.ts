export async function* readableStreamToAsyncGenerator<T>(
  stream: ReadableStream<T>
): AsyncGenerator<T> {
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      yield value as T
    }
  } finally {
    reader.releaseLock()
  }
}
