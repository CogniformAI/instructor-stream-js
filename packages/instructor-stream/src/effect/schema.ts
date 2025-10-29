import type { Schema } from 'effect/Schema'
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

/**
 * Resolves a schema source into a resolved schema with validated effect and/or zod schemas.
 *
 * @template A - The type parameter representing the schema's inferred type
 * @param {SchemaSource<A>} source - The schema source object containing optional effect/zod schemas and a name
 * @returns {ResolvedSchema<A>} A resolved schema object containing the name and available schemas
 * @throws {SchemaResolutionError} When neither an Effect schema nor a Zod schema is provided
 *
 * @example
 * ```typescript
 * const schema = resolveSchema({
 *   name: 'UserSchema',
 *   zod: z.object({ name: z.string() })
 * });
 * ```
 */
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
