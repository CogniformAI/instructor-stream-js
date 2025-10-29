import { Bench } from 'tinybench'
import JSONParser from '../instructor-stream/src/utils/json-parser.ts'
import { setDeep } from '../instructor-stream/src/utils/path.ts'

type Path = (string | number)[]

const bigJson = JSON.stringify({
  user: { name: 'Alice', bio: 'Long bio '.repeat(1000), age: 42 },
  posts: Array.from({ length: 500 }, (_, i) => ({ id: i, title: `T${i}`, body: 'X'.repeat(200) })),
})

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

const immutableSet = (source: unknown, path: Path, value: unknown): unknown => {
  if (path.length === 0) {
    return value
  }
  const [key, ...rest] = path
  const nextPath = rest as Path
  if (typeof key === 'number') {
    const clone = Array.isArray(source) ? [...(source as unknown[])] : []
    clone[key] = immutableSet(clone[key], nextPath, value)
    return clone
  }
  const record =
    source && typeof source === 'object' ? { ...(source as Record<string, unknown>) } : {}
  record[String(key)] = immutableSet(
    (source as Record<string, unknown> | undefined)?.[String(key)],
    nextPath,
    value
  )
  return record
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
    .add('immutable structural copy (large JSON)', () => {
      let target: unknown = clone(stub)
      for (const a of assignments) {
        target = immutableSet(target, a.path, a.value)
      }
      return target
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
