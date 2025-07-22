/**
 * Omits the specified keys from the given object.
 *
 * @template T The type of the object.
 * @template K The type of the keys to omit.
 * @param {K[]} keys The keys to omit.
 * @param {T} obj The object to omit from.
 * @returns {Omit<T, K>} The object with the specified keys omitted.
 */
export function omit<T extends object, K extends keyof T>(keys: K[], obj: T): Omit<T, K> {
  const result = {} as Omit<T, K>
  for (const key in obj) {
    if (obj.hasOwnProperty(key) && !keys.includes(key as unknown as K)) {
      result[key as unknown as Exclude<keyof T, K>] = obj[key] as unknown as T[Exclude<keyof T, K>]
    }
  }
  return result
}

/**
 * Creates `n` async generators that emit the elements of the given iterable in
 * the same order, but allows the consumer to iterate over the elements in
 * parallel. The returned generators are "hot", meaning that they will queue up
 * elements from the iterable even if no one is iterating over them.
 *
 * @template T The type of the elements in the iterable.
 * @param {AsyncIterable<T>} iterable The iterable to tee.
 * @param {number} n The number of async generators to create.
 * @returns {Promise<AsyncGenerator<T>[]>} A promise that resolves to an array of
 *   `n` async generators.
 */
export async function iterableTee<T>(
  iterable: AsyncIterable<T>,
  n: number
): Promise<AsyncGenerator<T>[]> {
  const buffers: T[][] = Array.from({ length: n }, () => [])
  const resolvers: (() => void)[] = []
  const iterator = iterable[Symbol.asyncIterator]()
  let done = false

  const reader = async function* (index: number): AsyncGenerator<T> {
    while (true) {
      if (buffers[index].length > 0) {
        yield buffers[index].shift()!
      } else if (done) {
        break
      } else {
        await new Promise<void>((resolve) => resolvers.push(resolve))
      }
    }
  }
  await (async () => {
    for await (const item of {
      [Symbol.asyncIterator]: () => iterator,
    }) {
      for (const buffer of buffers) {
        buffer.push(item)
      }

      while (resolvers.length > 0) {
        resolvers.shift()!()
      }
    }
    done = true
    while (resolvers.length > 0) {
      resolvers.shift()!()
    }
  })()

  return Array.from({ length: n }, (_, i) => reader(i))
}
