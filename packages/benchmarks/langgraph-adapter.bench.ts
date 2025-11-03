import { Bench } from 'tinybench'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import {
  fastAdapter,
  type LangGraphDelta,
} from '../instructor-stream/src/langgraph/fast-adapter.ts'
import { SchemaStream } from '../instructor-stream/src/utils/streaming-json-parser.ts'
import { z } from 'zod'

type Envelope = {
  data?: unknown[]
}

const BENCH_TIME = Number.parseInt(process.env.BENCH_TIME ?? '2000', 10)
const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = join(__dirname, 'data', 'langgraph-fixture.jsonl')

const raw = readFileSync(FIXTURE_PATH, 'utf8')
const fixture: Envelope[] = raw
  .split('\n')
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line) as Envelope)

if (fixture.length !== 4096) {
  throw new Error(`Expected 4096 envelopes, received ${fixture.length}`)
}

const streamSchema = z.object({
  alpha: z.object({
    message: z.string().nullable().optional(),
  }),
  beta: z.object({
    value: z.string().nullable().optional(),
  }),
})

const makeUpstream = () =>
  new ReadableStream<Envelope>({
    start(controller) {
      for (const envelope of fixture) {
        controller.enqueue(envelope)
      }
      controller.close()
    },
  })

const runPipeline = async (): Promise<number> => {
  const schemaStream = new SchemaStream(streamSchema, {
    autoJSONMode: 'off',
    snapshotMode: 'object',
  })
  const reader: ReadableStreamDefaultReader<LangGraphDelta> = makeUpstream()
    .pipeThrough(fastAdapter())
    .getReader()
  let completions = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      const { node, text } = value
      const outcome = schemaStream.ingest([node], text)
      completions += outcome.completions.length
      if (outcome.closed) {
        schemaStream.releaseContext([node])
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /** ignore */
    }
  }
  return completions
}

const bench = new Bench({ time: BENCH_TIME })

bench.add('langgraph fastAdapter + SchemaStream', async () => {
  const completions = await runPipeline()
  if (completions !== 1024) {
    throw new Error(`Unexpected completion count: ${completions}`)
  }
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

const formatRow = (row: (typeof summaries)[number]) => ({
  name: row.name,
  'ops/s': row.hz > 0 ? row.hz.toFixed(2) : '—',
  'mean (s)': row.mean > 0 ? row.mean.toFixed(4) : '—',
  '± rme': row.hz > 0 ? `${row.rme.toFixed(2)}%` : '—',
  samples: row.samples,
})

console.log('\nLangGraph adapter baseline (higher ops/s is better):\n')
console.table(summaries.map(formatRow))
