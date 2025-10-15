import { Bench } from 'tinybench'
import { lensPath, set as rSet } from 'ramda'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import JSONParser from '../instructor-stream/src/utils/json-parser.ts'
import { setDeep } from '../instructor-stream/src/utils/path.ts'
import { streamLangGraphEvents } from '../instructor-stream/src/adapters/langgraph/index.ts'

type Path = (string | number)[]

const bigJson = JSON.stringify({
  user: { name: 'Alice', bio: 'Long bio '.repeat(1000), age: 42 },
  posts: Array.from({ length: 500 }, (_, i) => ({ id: i, title: `T${i}`, body: 'X'.repeat(200) })),
})

const langgraphRaw = readFileSync(
  new URL(
    '../instructor-stream/src/adapters/langgraph/__tests__/mock-data/stream-mock.jsonl',
    import.meta.url
  ),
  'utf8'
)
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line))

const langgraphMessageSchema = z.any()
const langgraphToolSchemas = { screenshot_tool: z.any() }

function getPathFromStack(
  stack: Array<{ key: string | number | undefined }>,
  key?: string | number
): Path {
  const stackLen = stack.length
  const pathLen = stackLen > 0 ? stackLen - 1 : 0
  const out: (string | number)[] = new Array(pathLen + 1)
  for (let i = 1; i < stackLen; i += 1) {
    out[i - 1] = stack[i].key as string | number
  }
  out[pathLen] = key as string | number
  return out
}

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
  parser.onValue = () => void 0

  const encoder = new TextEncoder()
  const data = encoder.encode(json)
  const chunkSize = 1024
  for (let i = 0; i < data.length; i += chunkSize) {
    parser.write(data.slice(i, Math.min(i + chunkSize, data.length)))
  }
  if (!parser.isEnded) parser.end()
  return assignments
}

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

const makeLangGraphSource = (): AsyncIterable<unknown> => ({
  async *[Symbol.asyncIterator]() {
    for (const env of langgraphRaw) {
      yield env
    }
  },
})

async function runLangGraphReplay(): Promise<number> {
  let count = 0
  for await (const event of streamLangGraphEvents({
    source: makeLangGraphSource(),
    tag: 'screenshot',
    schema: langgraphMessageSchema,
    toolSchemas: langgraphToolSchemas,
  })) {
    if (event.kind === 'message' || event.kind === 'tool') {
      count += 1
    }
  }
  return count
}

async function main() {
  const assignments = await collectAssignments(bigJson)
  const stub = { user: { name: 'Unknown', bio: '', age: 0 }, posts: [] as unknown[] }

  const bench = new Bench({ time: Number.parseInt(process.env.BENCH_TIME ?? '2000', 10) })

  bench
    .add('in-place setDeep assignments (large JSON)', () => {
      const target = clone(stub) as Record<string, unknown>
      for (const a of assignments) setDeep(target, a.path, a.value)
      return target
    })
    .add('immutable Ramda set(assignments) (large JSON)', () => {
      let target: unknown = clone(stub)
      for (const a of assignments) target = rSet(lensPath(a.path), a.value, target)
      return target
    })
    .add('LangGraph stream replay (5k chunks, tag=screenshot)', async () => {
      await runLangGraphReplay()
    })

  await bench.run()

  const summaries = bench.tasks
    .map((task) => {
      const result = task.result
      const hz = result?.hz ?? 0
      return {
        name: task.name,
        hz,
        mean: result?.mean ?? 0,
        rme: result?.rme ?? 0,
        samples: result?.samples?.length ?? 0,
      }
    })
    .sort((a, b) => b.hz - a.hz)

  const bestHz = summaries[0]?.hz ?? 0
  const barWidth = 28

  const formatRow = (row: (typeof summaries)[number]) => {
    const relative = bestHz > 0 ? row.hz / bestHz : 0
    const barLength = bestHz > 0 ? Math.max(1, Math.round(relative * barWidth)) : 0
    return {
      name: row.name,
      'ops/s': row.hz > 0 ? row.hz.toFixed(2) : '—',
      'mean (ms)': row.mean > 0 ? row.mean.toFixed(4) : '—',
      '± rme': row.hz > 0 ? `${row.rme.toFixed(2)}%` : '—',
      samples: row.samples,
      rel: bestHz > 0 ? `${(relative * 100).toFixed(1)}%` : '—',
      bar: bestHz > 0 ? '█'.repeat(barLength) : '',
    }
  }

  console.log('\nBenchmark baseline (higher ops/s is better):\n')
  console.table(summaries.map(formatRow))
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
