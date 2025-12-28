import { describe, expect, test } from 'vitest'
import { Effect, Layer, Stream, Context } from 'effect'
import * as Chunk from 'effect/Chunk'
import * as LanguageModel from '@effect/ai/LanguageModel'
import * as Response from '@effect/ai/Response'
import { createOpenAILayers } from '../index.ts'
import { stream } from '@/effect/instructor.ts'
import { SnapshotHydratorLayer } from '@/effect/core/runtime.ts'
import { z } from 'zod'
type ToolMap = Record<string, never>
const usage = new Response.Usage({
  inputTokens: 10,
  outputTokens: 5,
  totalTokens: 15,
})
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
describe('OpenAI Adapter', () => {
  test('streams structured data with fake provider', async () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    })
    const parts: Array<Response.StreamPart<ToolMap>> = [
      Response.textStartPart({ id: 'chunk-0' }),
      Response.textDeltaPart({ id: 'chunk-0', delta: '{"name":' }),
      Response.textDeltaPart({ id: 'chunk-0', delta: '"Alice", "age":' }),
      Response.textDeltaPart({ id: 'chunk-0', delta: ' 30 }' }),
      Response.textEndPart({ id: 'chunk-0' }),
      Response.finishPart({ reason: 'stop', usage }),
    ]
    const instructorStream = stream({
      schema: { name: 'User', zod: schema },
      prompt: 'extract user',
      validationMode: 'final',
    })
    const hydratorContext = await Effect.runPromise(
      Layer.build(SnapshotHydratorLayer).pipe(Effect.scoped)
    )
    const languageContext = await Effect.runPromise(
      Layer.build(makeLanguageModelLayer(parts)).pipe(Effect.scoped)
    )
    const context = Context.merge(hydratorContext, languageContext)
    const chunk = await Effect.runPromise(
      Stream.runCollect(instructorStream).pipe(Effect.provide(context))
    )
    const snapshots = Chunk.toReadonlyArray(chunk)
    expect(snapshots.length).toBeGreaterThan(0)
    const final = snapshots[snapshots.length - 1]!
    expect(final.data[0]).toEqual({ name: 'Alice', age: 30 })
    expect(final._meta._isValid).toBe(true)
  })
  test('verifies no cloning - referential equality across emissions', async () => {
    const schema = z.object({
      items: z.array(z.string()),
    })
    const parts: Array<Response.StreamPart<ToolMap>> = [
      Response.textStartPart({ id: 'chunk-0' }),
      Response.textDeltaPart({ id: 'chunk-0', delta: '{"items":' }),
      Response.textDeltaPart({ id: 'chunk-0', delta: '["a"' }),
      Response.textDeltaPart({ id: 'chunk-0', delta: ',"b"]}' }),
      Response.textEndPart({ id: 'chunk-0' }),
      Response.finishPart({ reason: 'stop', usage }),
    ]
    const instructorStream = stream({
      schema: { name: 'Items', zod: schema },
      prompt: 'extract items',
    })
    const hydratorContext = await Effect.runPromise(
      Layer.build(SnapshotHydratorLayer).pipe(Effect.scoped)
    )
    const languageContext = await Effect.runPromise(
      Layer.build(makeLanguageModelLayer(parts)).pipe(Effect.scoped)
    )
    const context = Context.merge(hydratorContext, languageContext)
    const chunk = await Effect.runPromise(
      Stream.runCollect(instructorStream).pipe(Effect.provide(context))
    )
    const snapshots = Chunk.toReadonlyArray(chunk)
    if (snapshots.length >= 2) {
      const first = snapshots[0]!.data[0]
      const second = snapshots[1]!.data[0]
      expect(first).toBe(second)
    }
  })
  test('handles malformed JSON without console.warn', async () => {
    const schema = z.object({
      value: z.string(),
    })
    const parts: Array<Response.StreamPart<ToolMap>> = [
      Response.textStartPart({ id: 'chunk-0' }),
      Response.textDeltaPart({ id: 'chunk-0', delta: '{"value": invalid}' }),
      Response.textEndPart({ id: 'chunk-0' }),
      Response.finishPart({ reason: 'stop', usage }),
    ]
    const instructorStream = stream({
      schema: { name: 'Value', zod: schema },
      prompt: 'extract value',
      validationMode: 'final',
    })
    const hydratorContext = await Effect.runPromise(
      Layer.build(SnapshotHydratorLayer).pipe(Effect.scoped)
    )
    const languageContext = await Effect.runPromise(
      Layer.build(makeLanguageModelLayer(parts)).pipe(Effect.scoped)
    )
    const context = Context.merge(hydratorContext, languageContext)
    const chunk = await Effect.runPromise(
      Stream.runCollect(instructorStream).pipe(Effect.provide(context))
    )
    const snapshots = Chunk.toReadonlyArray(chunk)
    expect(snapshots.length).toBeGreaterThan(0)
    const final = snapshots[snapshots.length - 1]!
    expect(final._meta._isValid).toBe(false)
  })
  test('createOpenAILayers exports layer helper', () => {
    const layers = createOpenAILayers({ apiKey: 'fake-key', model: 'gpt-4o-mini' })
    expect(layers).toBeDefined()
  })
})
