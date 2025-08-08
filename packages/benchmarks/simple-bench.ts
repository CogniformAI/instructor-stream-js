import { Bench } from 'tinybench'
import { lensPath, set as rSet } from 'ramda'
import JSONParser from '@core/utils/json-parser.ts'
import { setDeep } from '@core/utils/path.ts'

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
  parser.onToken = ({ parser: p, tokenizer: t }) => {
    const path = getPathFromStack(p.stack as Array<{ key: string | number | undefined }>, p.key as string | number)
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

async function main() {
  const assignments = await collectAssignments(bigJson)
  const stub = { user: { name: 'Unknown', bio: '', age: 0 }, posts: [] as unknown[] }

  const bench = new Bench({ time: Number.parseInt(process.env.BENCH_TIME ?? '5000', 10) })

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

  await bench.run()

  console.table(
    bench.tasks.map((t) => ({
      name: t.name,
      hz: t.result?.hz?.toFixed(2),
      mean: t.result?.mean?.toFixed(4),
      min: t.result?.min?.toFixed(4),
      max: t.result?.max?.toFixed(4),
      samples: t.result?.samples,
    }))
  )
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
