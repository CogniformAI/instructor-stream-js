import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createTaggedPipelines } from '../index'

function makeEnvelope(content: string, tags: string[]) {
  return {
    event: 'messages' as const,
    data: [
      {
        type: 'AIMessageChunk' as const,
        content,
      },
      {
        tags,
      },
    ],
  }
}

describe('createTaggedPipelines', () => {
  it('routes tagged envelopes to independent schema streams without starving each other', async () => {
    async function* source() {
      yield makeEnvelope('{"message":"bet', ['profile'])
      yield makeEnvelope('{"info":"tw', ['style'])
      yield makeEnvelope('a"}', ['profile'])
      yield makeEnvelope('o"}', ['style'])
    }

    const pipelines = createTaggedPipelines(
      source(),
      {
        profile: z.object({
          message: z.string().nullable().optional(),
        }),
        style: z.object({
          info: z.string().nullable().optional(),
        }),
      },
      { string: null }
    )

    const collectProfile = (async () => {
      const snapshots: Array<{ message: string | null | undefined }> = []
      for await (const snapshot of pipelines.profile) {
        snapshots.push(snapshot)
      }
      return snapshots
    })()

    const collectStyle = (async () => {
      const snapshots: Array<{ info: string | null | undefined }> = []
      for await (const snapshot of pipelines.style) {
        snapshots.push(snapshot)
      }
      return snapshots
    })()

    const [profileSnapshots, styleSnapshots] = await Promise.all([collectProfile, collectStyle])

    expect(profileSnapshots.length).toBeGreaterThan(0)
    expect(styleSnapshots.length).toBeGreaterThan(0)
    expect(profileSnapshots.at(-1)?.message).toBe('beta')
    expect(styleSnapshots.at(-1)?.info).toBe('two')
  })
})
