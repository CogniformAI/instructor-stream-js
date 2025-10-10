import { z } from 'zod'

/**
 * Profile schema for the "profile" tag stream.
 *
 * Notes:
 * - All fields are string | null | undefined to tolerate partial streaming states.
 * - You can pass { string: null } as `typeDefaults` to SchemaStream so fields initialize to null.
 */
export const ProfileSchema = z.object({
  business_name: z.string().nullable().optional(),
  type_of_business: z.string().nullable().optional(),
  founding_date: z.string().nullable().optional(),
  founders: z.string().nullable().optional(),
  key_milestones: z.string().nullable().optional(),
  brand_promise_and_value_proposition: z.string().nullable().optional(),
  key_differentiators: z.string().nullable().optional(),
  interesting_facts_and_achievements: z.string().nullable().optional(),
  website_url: z.string().nullable().optional(),
  physical_address: z.string().nullable().optional(),
  phone_number: z.string().nullable().optional(),
  email_address: z.string().nullable().optional(),
})

export type Profile = z.infer<typeof ProfileSchema>

/**
 * Optional helper to configure SchemaStream defaults for strings.
 * Example usage:
 *   const stream = instructorStreamFromLangGraph({
 *     source, tag: 'profile', schema: ProfileSchema, typeDefaults: ProfileTypeDefaults
 *   })
 */
export const ProfileTypeDefaults: { string: string | null } = { string: null }

/**
 * The tag used to select this schema in the LangGraph adapter.
 */
export const ProfileTag = 'profile'
