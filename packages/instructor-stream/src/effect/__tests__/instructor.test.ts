import { describe, expect, test } from 'vitest'
import { Effect, Layer, Stream, Context } from 'effect'
import * as Chunk from 'effect/Chunk'
import * as LanguageModel from '@effect/ai/LanguageModel'
import * as Response from '@effect/ai/Response'
import { stream as instructorStream, stub } from '@/effect/instructor.ts'
import { SnapshotHydratorLayer } from '@/effect/core/runtime.ts'
import { z } from 'zod'

type ToolMap = Record<string, never>

const usage = new Response.Usage({
  inputTokens: 10,
  outputTokens: 5,
  totalTokens: 15,
})

const sampleParts: Array<Response.StreamPart<ToolMap>> = [
  Response.textStartPart({ id: 'chunk-0' }),
  Response.textDeltaPart({ id: 'chunk-0', delta: '{"name":' }),
  Response.textDeltaPart({ id: 'chunk-0', delta: '"Ada", "age":' }),
  Response.textDeltaPart({ id: 'chunk-0', delta: ' 42 }' }),
  Response.textEndPart({ id: 'chunk-0' }),
  Response.finishPart({ reason: 'stop', usage }),
]

const makeLanguageModelLayer = (
  parts: Array<Response.StreamPart<ToolMap>>
): Layer.Layer<LanguageModel.LanguageModel> => {
  const service: LanguageModel.Service = {
    generateText: () => Effect.die('unexpected generateText call'),
    generateObject: () => Effect.die('unexpected generateObject call'),
    streamText: () => Stream.fromIterable(parts),
  }
  return Layer.succeed(LanguageModel.LanguageModel, service)
}

describe('Effect instructor stream', () => {
  test('hydrates streaming JSON snapshots with metadata', async () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    })

    const stream = instructorStream({
      schema: { name: 'User', zod: schema },
      prompt: 'extract user',
      validationMode: 'final',
    })

    const hydratorContext = await Effect.runPromise(
      Layer.build(SnapshotHydratorLayer).pipe(Effect.scoped)
    )
    const languageContext = await Effect.runPromise(
      Layer.build(makeLanguageModelLayer(sampleParts)).pipe(Effect.scoped)
    )
    const context = Context.merge(hydratorContext, languageContext)

    const chunk = await Effect.runPromise(Stream.runCollect(stream).pipe(Effect.provide(context)))

    const snapshots = Chunk.toReadonlyArray(chunk)
    expect(snapshots.length).toBeGreaterThan(0)

    const final = snapshots[snapshots.length - 1]!
    expect(final.data[0]).toEqual({ name: 'Ada', age: 42 })
    expect(final.meta._type).toBeUndefined()
    expect(final.meta._isValid).toBe(true)
  })

  test('creates schema stubs using defaults', async () => {
    const schema = z.object({
      total: z.number().optional(),
      label: z.string().nullable(),
    })

    const hydratorContext = await Effect.runPromise(
      Layer.build(SnapshotHydratorLayer).pipe(Effect.scoped)
    )
    const result = await Effect.runPromise(
      stub({ name: 'StubSchema', zod: schema }).pipe(Effect.provide(hydratorContext))
    )

    expect(result).toEqual({ total: null, label: null })
  })
})
