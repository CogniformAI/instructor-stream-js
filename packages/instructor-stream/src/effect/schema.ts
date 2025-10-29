import type { Schema } from '@effect/schema/Schema'
import type { z } from 'zod'
import { SchemaResolutionError } from './errors.ts'

export type SchemaValidationMode = 'none' | 'on-complete' | 'final'

export type SchemaSource<A> = {
  readonly name: string
  readonly effect?: Schema<A>
  readonly zod?: z.ZodType<A>
}

export type ResolvedSchema<A> = {
  readonly name: string
  readonly effect?: Schema<A>
  readonly zod?: z.ZodType<A>
}

export const resolveSchema = <A>(source: SchemaSource<A>): ResolvedSchema<A> => {
  if (!source.effect && !source.zod) {
    throw new SchemaResolutionError({
      message: `Schema '${source.name}' must supply at least an Effect schema or a Zod schema.`,
    })
  }
  return {
    name: source.name,
    ...(source.effect ? { effect: source.effect } : {}),
    ...(source.zod ? { zod: source.zod } : {}),
  } as ResolvedSchema<A>
}
