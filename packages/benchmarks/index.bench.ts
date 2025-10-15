import { bench, describe, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { lensPath, set as rSet } from 'ramda'
import JSONParser from '../instructor-stream/src/utils/json-parser.ts'
import { setDeep } from '../instructor-stream/src/utils/path.ts'
import { streamLangGraphEvents } from '../instructor-stream/src/adapters/langgraph/index.ts'
import { z } from 'zod'

type Path = (string | number)[]
const BENCH_TIME = Number.parseInt(process.env.BENCH_TIME ?? '5000', 10)

const bigJson = JSON.stringify({
  user: { name: 'Alice', bio: 'Long bio '.repeat(1000), age: 42 },
  posts: Array.from({ length: 500 }, (_, i) => ({ id: i, title: `T${i}`, body: 'X'.repeat(200) })),
})

describe('langgraph adapter streaming', () => {
  let envelopes: unknown[]
  const messageSchema = z.any()
  const toolSchemas = { screenshot_tool: z.any() }

  beforeAll(() => {
    const file = readFileSync(
      new URL(
        '../instructor-stream/src/adapters/langgraph/__tests__/mock-data/stream-mock.jsonl',
        import.meta.url
      ),
      'utf8'
    )
    envelopes = file
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line))
  })

  const makeSource = (): AsyncIterable<unknown> => ({
    async *[Symbol.asyncIterator]() {
      for (const env of envelopes) {
        yield env
      }
    },
  })

  bench(
    'streamLangGraphEvents (mock stream, tag=screenshot)',
    async () => {
      const iterator = streamLangGraphEvents({
        source: makeSource(),
        tag: 'screenshot',
        schema: messageSchema,
        toolSchemas,
      })
      for await (const _ of iterator) {
        // consume
      }
    },
    { time: BENCH_TIME }
  )
})

function getPathFromStack(
  stack: Array<{ key: string | number | undefined }>,
  key?: string | number
): Path {
  const stackLen = stack.length
  const pathLen = stackLen > 0 ? stackLen - 1 : 0
  const out: (string | number)[] = new Array(pathLen + 1)
  for (let i = 1; i < stackLen; i++) {
    out[i - 1] = stack[i].key as string | number
  }
  out[pathLen] = key as string | number
  return out
}

const chunkSize = 1024

async function collectAssignments(json: string): Promise<Array<{ path: Path; value: unknown }>> {
  const parser = new JSONParser({ stringBufferSize: 0, handleUnescapedNewLines: true })
  const assignments: Array<{ path: Path; value: unknown }> = []
  parser.onToken = ({
    parser: p,
    tokenizer: t,
  }: {
    parser: { stack: Array<{ key: string | number | undefined }>; key?: string | number }
    tokenizer: { value: unknown }
  }) => {
    const path = getPathFromStack(
      p.stack as Array<{ key: string | number | undefined }>,
      p.key as string | number
    )
    assignments.push({ path, value: t.value })
  }
  parser.onValue = () => undefined

  const encoder = new TextEncoder()
  const data = encoder.encode(json)
  for (let i = 0; i < data.length; i += chunkSize) {
    parser.write(data.slice(i, Math.min(i + chunkSize, data.length)))
  }
  if (!parser.isEnded) parser.end()
  return assignments
}

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

describe('update strategy benchmarks', () => {
  let assignments: Array<{ path: Path; value: unknown }>
  const stub = { user: { name: 'Unknown', bio: '', age: 0 }, posts: [] as unknown[] }

  beforeAll(async () => {
    assignments = await collectAssignments(bigJson)
  })

  bench(
    'in-place setDeep assignments (large JSON)',
    () => {
      const target = clone(stub)
      for (const a of assignments) setDeep(target as Record<string, unknown>, a.path, a.value)
    },
    { time: BENCH_TIME }
  )

  bench(
    'immutable Ramda set(assignments) (large JSON)',
    () => {
      let target: unknown = clone(stub)
      for (const a of assignments) {
        const lp = lensPath(a.path)
        target = rSet(lp, a.value, target)
      }
    },
    { time: BENCH_TIME }
  )
})
