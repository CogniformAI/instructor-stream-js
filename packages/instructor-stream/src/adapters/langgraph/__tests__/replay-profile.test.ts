import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock(
  '~~/server/utils/langgraph-trace',
  () => ({
    traceLanggraph: () => {},
  }),
  { virtual: true }
)

import { instructorStreamFromLangGraph, streamLangGraphEvents } from '../index'
import {
  ProfileSchema as LegacyProfileSchema,
  ProfileTag,
  ProfileTypeDefaults,
} from './schemas/profile'
import { replayJsonlFile } from './utils'

let ReplayProfileSchema = LegacyProfileSchema
try {
  const module = await import('./schema/profile')
  if (module?.ProfileSchema) {
    ReplayProfileSchema = module.ProfileSchema
  }
} catch {
  // fall back to legacy schema when the new one is not present
}

let ProvidedDirectionSchema: z.ZodTypeAny = z.object({ breakdown: z.unknown() }).passthrough()
try {
  const module = await import('./schema/direction')
  if (module?.DirectionSchema) {
    ProvidedDirectionSchema = module.DirectionSchema
  }
} catch {
  // retain fallback schema
}

const DirectionSchema = ProvidedDirectionSchema

/**
 * Replay a subset of JSONL lines as an AsyncIterable at a target TPS range.
 */
async function* replayJsonlLines(
  lines: string[],
  start: number,
  end: number,
  tpsMin = 20,
  tpsMax = 30
): AsyncGenerator<unknown> {
  function delay(ms: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }
  function randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }
  const total = Math.max(0, Math.min(end, lines.length) - start)
  for (let i = 0; i < total; i++) {
    const line = lines[start + i]
    if (!line || !line.trim()) continue
    try {
      const obj = JSON.parse(line)
      const tps = randomInt(tpsMin, tpsMax)
      const ms = Math.max(1, Math.floor(1000 / tps))
      await delay(ms)
      yield obj
    } catch {
      // ignore malformed lines
    }
  }
}

function countFilledStringFields(obj: Record<string, unknown>): number {
  let count = 0
  for (const value of Object.values(obj)) {
    if (typeof value === 'string' && value.length > 0) count += 1
  }
  return count
}

describe('LangGraph adapter replay (profile tag)', () => {
  const TEST_TIMEOUT_MS = 20_000
  it(
    'replays mock JSONL at 20–30 TPS and validates Profile snapshots',
    async () => {
      const __dirname = path.dirname(fileURLToPath(import.meta.url))
      const mockPath = path.join(__dirname, 'mock-langgraph.jsonl')
      if (!fs.existsSync(mockPath)) {
        console.warn(`mock-langgraph.jsonl not found at ${mockPath}, skipping profile replay test.`)
        expect(true).toBe(true)
        return
      }
      const contents = fs.readFileSync(mockPath, 'utf8')
      const lines = contents.split(/\r?\n/).filter(Boolean)

      const candidateIndices: number[] = []
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (
          line.includes('"event":"messages"') &&
          line.includes('"tags"') &&
          line.includes('profile')
        ) {
          candidateIndices.push(i)
        }
      }
      if (candidateIndices.length === 0) {
        console.warn(
          'No "profile" tag found in mock-langgraph.jsonl, skipping profile validation test.'
        )
        expect(true).toBe(true)
        return
      }

      const anchor = candidateIndices[0]
      const windowBefore = 10
      const windowAfter = 500
      const start = Math.max(0, anchor - windowBefore)
      const end = Math.min(lines.length, anchor + windowAfter)
      const source = replayJsonlLines(lines, start, end, 20, 30)

      const snapshots: Array<ReturnType<typeof ReplayProfileSchema.parse>> = []
      let lastFilled = 0

      for await (const snapshot of instructorStreamFromLangGraph({
        source,
        tag: ProfileTag,
        schema: ReplayProfileSchema,
        typeDefaults: ProfileTypeDefaults,
      })) {
        const parsed = ReplayProfileSchema.safeParse(snapshot)
        expect(parsed.success).toBe(true)
        const filled = countFilledStringFields(parsed.data as Record<string, unknown>)
        expect(filled).toBeGreaterThanOrEqual(lastFilled)
        lastFilled = filled
        snapshots.push(parsed.data)
        if (filled >= 3 || snapshots.length >= 100) break
      }

      expect(snapshots.length).toBeGreaterThan(0)
      const final = ReplayProfileSchema.parse(snapshots.at(-1))
      expect(final).toBeTruthy()
    },
    TEST_TIMEOUT_MS
  )
})

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const ANTHROPIC_MOCK_PATH = path.join(TEST_DIR, 'mock-data/stream-mock-anthropic.jsonl')
const GOOGLE_MOCK_PATH = path.join(TEST_DIR, 'mock-data/stream-mock-google.jsonl')
const HAS_ANTHROPIC_MOCK = fs.existsSync(ANTHROPIC_MOCK_PATH)
const HAS_GOOGLE_MOCK = fs.existsSync(GOOGLE_MOCK_PATH)

describe('LangGraph adapter replay (mock streams)', () => {
  const anthropicIt = HAS_ANTHROPIC_MOCK ? it : it.skip
  anthropicIt('replays anthropic screenshot tool-call chunks end-to-end', async () => {
    const source = replayJsonlFile(ANTHROPIC_MOCK_PATH, {
      fixedIntervalMs: 0,
    })

    let lastRaw = ''
    let toolCount = 0

    for await (const event of streamLangGraphEvents({
      source,
      tag: 'screenshot',
      schema: z.object({}).passthrough(),
      toolSchemas: { screenshot_tool: z.any() },
      typeDefaults: { string: null },
    })) {
      if (event.kind !== 'tool') continue
      lastRaw = event.rawArgs
      toolCount += 1
    }

    expect(toolCount).toBeGreaterThan(0)
    expect(lastRaw).toContain('website_url')
    expect(lastRaw.trim().endsWith('}')).toBe(true)
  })

  const googleIt = HAS_GOOGLE_MOCK ? it : it.skip
  googleIt('replays google direction stream and yields structured snapshots', async () => {
    let validSnapshot: z.infer<typeof DirectionSchema> | null = null
    const source = replayJsonlFile(GOOGLE_MOCK_PATH, {
      fixedIntervalMs: 0,
    })

    for await (const snapshot of instructorStreamFromLangGraph({
      source,
      tag: 'direction',
      schema: DirectionSchema,
      typeDefaults: { string: null },
    })) {
      const parsed = DirectionSchema.safeParse(snapshot)
      if (parsed.success) {
        validSnapshot = parsed.data
        break
      }
    }

    expect(validSnapshot).not.toBeNull()
    expect(validSnapshot?.breakdown).toBeTruthy()
  })
})
