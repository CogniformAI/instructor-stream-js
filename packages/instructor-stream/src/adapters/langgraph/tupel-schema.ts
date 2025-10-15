/**
 * @file tupel-schema.ts
 * @description This file contains zod schema created from a complete end to end langgraph run.
 * Some of the enums are variable and will differ from setup to setup. They will be marked for reference.
 * Also to note this is for the `messages-tuple` stream mode.
 */

import * as z from 'zod'

/** The last chunk position */
export const ChunkPositionSchema = z.string()
export type ChunkPosition = z.infer<typeof ChunkPositionSchema>

export const IndexEnumSchema = z.union([z.string(), z.number()])
export type IndexEnum = z.infer<typeof IndexEnumSchema>

/**
 * NOTE: This is the new universal content_block type in langgraph 1.0.0a4 and newer
 * "content": [{ "type": "text", "text": "Hello, world!" , index: 0}] - text block
 * "content": [{ "type": "image_url", "url": "https://example.com/image.png" , index: 0}] - image block
 * @see https://docs.langchain.com/oss/javascript/langchain/messages
 */
export const ContentTypeSchema = z.string()
export type ContentType = z.infer<typeof ContentTypeSchema>

/** The creator of the chunk */
export const CreatedBySchema = z.enum(['ai', 'AIMessageChunk', 'human', 'system', 'tool'])
export type CreatedBy = z.infer<typeof CreatedBySchema>

/** The graph id */
export const GraphIdSchema = z.string()
export type GraphId = z.infer<typeof GraphIdSchema>

/** The type of invalid tool call */
export const InvalidToolCallTypeSchema = z.string()
export type InvalidToolCallType = z.infer<typeof InvalidToolCallTypeSchema>

/** The version of the langgraph api that this was created with */
export const LanggraphApiVersionSchema = z.string()
export type LanggraphApiVersion = z.infer<typeof LanggraphApiVersionSchema>

/** The host of the langgraph api that this was created with */
export const LanggraphHostSchema = z.string()
export type LanggraphHost = z.infer<typeof LanggraphHostSchema>

/**
 * @description The type of the langgraph node
 * - There are two main ways to identify a node:
 * 1. The name of the node via the `langgraph_node` field in the metadata
 * 2. Via tags added to a LLM call
 * NOTE: you can only tag LLM calls, not nodes that dont have an LLM call
 * @warning This is run dependent and will differ from setup to setup
 */
export const LanggraphNodeSchema = z.string()
export type Langgraph = z.infer<typeof LanggraphNodeSchema>

/** The langraph plan of the user */
export const LanggraphPlanSchema = z.string()
export type LanggraphPlan = z.infer<typeof LanggraphPlanSchema>

/**
 * @description The triggers of the langgraph node
 * - This is the trigger that is used to branch the flow
 * @warning This is run dependent and will differ from setup to setup
 */
export const LanggraphTriggerSchema = z.string()
export type LanggraphTrigger = z.infer<typeof LanggraphTriggerSchema>

/** The version of the langgraph api that this was created with */
export const LanggraphVersionSchema = z.string()
export type LanggraphVersion = z.infer<typeof LanggraphVersionSchema>

/** The variant of the langgraph api that this was created with */
export const LangsmithLanggraphApiVariantSchema = z.string()
export type LangsmithLanggraphApiVariant = z.infer<typeof LangsmithLanggraphApiVariantSchema>

/** The project of the langgraph api */
export const LangsmithProjectSchema = z.string()
export type LangsmithProject = z.infer<typeof LangsmithProjectSchema>

/** The llm model name, this will have more than one if you use multiple models */
export const LsModelNameSchema = z.string()
export type LsModelName = z.infer<typeof LsModelNameSchema>

/** The type of the llm model */
export const LsModelTypeSchema = z.string()
export type LsModelType = z.infer<typeof LsModelTypeSchema>

/** The provider of the llm model */
export const ProviderSchema = z.string()
export type Provider = z.infer<typeof ProviderSchema>

/**
 *  @description The version of the output
 * - This is important because right now you can only get consistent content blocks from v1 outputs
 * other wise you will get a mixed bag of content blocks
 */
export const OutputVersionSchema = z.string()
export type OutputVersion = z.infer<typeof OutputVersionSchema>

/**
 * @description The tags of the langgraph node
 * - These are the tags that are added to the LLM call, not the node
 * IMPORTANT: This is one of the two main ways to identify where the stream is coming from.
 * The other way is via the `langgraph_node` field in the metadata
 * @warning This is run dependent and will differ from setup to setup
 */
export const TagSchema = z.string()
export type Tag = z.infer<typeof TagSchema>

/** The event type, this will vary depending on the stream mode */
export const EventSchema = z.enum(['messages', 'metadata'])
export type Event = z.infer<typeof EventSchema>

// export const HslSchema = z.object({
//     "hue": z.number(),
//     "saturation": z.number(),
//     "lightness": z.number(),
// });
// export type Hsl = z.infer<typeof HslSchema>;

// export const ThemeTokensSchema = z.object({
//     "primary_bg": z.string(),
//     "primary_text": z.string(),
//     "secondary_bg": z.string(),
//     "secondary_text": z.string(),
//     "muted_bg": z.string(),
//     "muted_text": z.string(),
//     "accent_bg": z.string(),
//     "accent_text": z.string(),
// });
// export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;

// export const AudioDirectionSchema = z.object({
//     "music_suggestion": z.string(),
//     "sound_design": z.string(),
//     "vo_timing": z.string(),
// });
// export type AudioDirection = z.infer<typeof AudioDirectionSchema>;

// export const CameraShotSchema = z.object({
//     "shot_number": z.number(),
//     "start_time": z.number(),
//     "end_time": z.number(),
//     "content": z.string(),
//     "dialog": z.string(),
//     "on_screen_text": z.string(),
// });
// export type CameraShot = z.infer<typeof CameraShotSchema>;

// export const PersonasAndArchetypeSchema = z.object({
//     "name": z.string(),
//     "description": z.string(),
//     "state_in_shot": z.string(),
// });
// export type PersonasAndArchetype = z.infer<typeof PersonasAndArchetypeSchema>;

// export const VisualStyleSchema = z.object({
//     "style_name": z.string(),
//     "director_reference": z.string(),
//     "visual_approach": z.string(),
//     "color_palette": z.string(),
//     "camera_style": z.string(),
//     "lighting": z.string(),
//     "pacing_strategy": z.string(),
// });
// export type VisualStyle = z.infer<typeof VisualStyleSchema>;

// export const StoryBeatsSchema = z.object({
//     "sec_0_8": z.string(),
//     "sec_8_16": z.string(),
//     "sec_16_24": z.string(),
//     "sec_24_30": z.string(),
// });
// export type StoryBeats = z.infer<typeof StoryBeatsSchema>;

// export const ProfileSchema = z.object({
//     "business_name": z.string(),
//     "type_of_business": z.string(),
//     "founding_date": z.string(),
//     "founders": z.string(),
//     "key_milestones": z.string(),
//     "brand_promise_and_value_proposition": z.string(),
//     "key_differentiators": z.string(),
//     "interesting_facts_and_achievements": z.string(),
//     "website_url": z.string(),
//     "physical_address": z.string(),
//     "phone_number": z.string(),
//     "email_address": z.string(),
// });
// export type Profile = z.infer<typeof ProfileSchema>;

// export const ShotSchema = z.object({
//     "index": z.number(),
//     "veo_copy": z.string(),
//     "camera": z.string(),
//     "setting": z.string(),
//     "subjects": z.string(),
//     "style": z.string(),
//     "timeline": z.string(),
//     "audio": z.string(),
// });
// export type Shot = z.infer<typeof ShotSchema>;

export const ImageUrlSchema = z
  .object({
    url: z.string(),
  })
  .catchall(z.unknown())
export type ImageUrl = z.infer<typeof ImageUrlSchema>

/** The invalid tool call */
export const InvalidToolOrToolCallChunkSchema = z
  .object({
    name: z.union([z.null(), z.string()]),
    args: z.string().optional(),
    id: z.union([z.null(), z.string()]),
    error: z.null().optional(),
    type: InvalidToolCallTypeSchema,
    index: z.number().optional(),
  })
  .catchall(z.unknown())
export type InvalidToolCallOrToolCallChunk = z.infer<typeof InvalidToolOrToolCallChunkSchema>

export const MetadataSchema = z.object({}).catchall(z.unknown())
export type Metadata = z.infer<typeof MetadataSchema>

/** The completion tokens details */
export const CompletionTokensDetailsSchema = z.object({
  accepted_prediction_tokens: z.number(),
  audio_tokens: z.number(),
  reasoning_tokens: z.number(),
  rejected_prediction_tokens: z.number(),
})
export type CompletionTokensDetails = z.infer<typeof CompletionTokensDetailsSchema>

/** The prompt tokens details */
export const PromptTokensDetailsSchema = z.object({
  audio_tokens: z.number(),
  cached_tokens: z.number(),
})
export type PromptTokensDetails = z.infer<typeof PromptTokensDetailsSchema>

/** The tool call schema this is for content block type tool_call_chunk */
export const ToolCallSchema = z
  .object({
    name: z.string(),
    args: z.unknown(),
    id: z.union([z.null(), z.string()]),
    type: z.string(),
  })
  .catchall(z.unknown())
export type ToolCall = z.infer<typeof ToolCallSchema>

/** The input tokens details */
export const InputTokenDetailsSchema = z.object({
  audio: z.number().optional(),
  cache_read: z.number(),
})
export type InputTokenDetails = z.infer<typeof InputTokenDetailsSchema>

/** The output tokens details (Provider specific) */
export const OutputTokenDetailsSchema = z.object({
  audio: z.number().optional(),
  reasoning: z.number(),
})
export type OutputTokenDetails = z.infer<typeof OutputTokenDetailsSchema>

// export const ColorSchema = z.object({
//     "name": z.string(),
//     "hex": z.string(),
//     "rgb": z.array(z.number()),
//     "hsl": HslSchema,
//     "recommended_text": z.string(),
//     "contrast_with_recommended": z.number(),
//     "wcag_AA_ok": z.boolean(),
// });
// export type Color = z.infer<typeof ColorSchema>;

// export const BreakdownSchema = z.object({
//     "visual_style": VisualStyleSchema,
//     "personas_and_archetypes": z.array(PersonasAndArchetypeSchema),
//     "camera_shots": z.array(CameraShotSchema),
//     "audio_direction": AudioDirectionSchema,
// });
// export type Breakdown = z.infer<typeof BreakdownSchema>;

// export const IdeaSchema = z.object({
//     "name": z.string(),
//     "concept": z.string(),
//     "strategy": z.string(),
//     "emotion": z.string(),
//     "big_idea": z.string(),
//     "story_beats": StoryBeatsSchema,
// });
// export type Idea = z.infer<typeof IdeaSchema>;

/**
 * @description The content element schema
 * - This is what is inside of the content block
 * - This is the text, image, or tool call chunk
 * @see https://docs.langchain.com/oss/javascript/langchain/messages
 */
export const ContentElementSchema = z
  .object({
    type: ContentTypeSchema,
    text: z.string().optional(),
    index: z.union([IndexEnumSchema, z.number()]).optional(),
    id: z.union([z.null(), z.string()]).optional(),
    name: z.union([z.null(), z.string()]).optional(),
    args: z.string().optional(),
    image_url: ImageUrlSchema.optional(),
  })
  .catchall(z.unknown())
export type ContentElement = z.infer<typeof ContentElementSchema>

/** The token usage schema */
export const TokenUsageSchema = z.object({
  completion_tokens: z.number(),
  prompt_tokens: z.number(),
  total_tokens: z.number(),
  completion_tokens_details: CompletionTokensDetailsSchema,
  prompt_tokens_details: PromptTokensDetailsSchema,
})
export type TokenUsage = z.infer<typeof TokenUsageSchema>

/** The usage metadata schema */
export const UsageMetadataSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number(),
  input_token_details: InputTokenDetailsSchema,
  output_token_details: OutputTokenDetailsSchema,
})
export type UsageMetadata = z.infer<typeof UsageMetadataSchema>

// export const PaletteSchema = z.object({
//     "colors": z.array(ColorSchema),
//     "css_vars": z.string(),
//     "theme_tokens": ThemeTokensSchema,
// });
// export type Palette = z.infer<typeof PaletteSchema>;

/** The response metadata schema */
export const ResponseMetadataSchema = z.object({
  model_provider: ProviderSchema.optional(),
  output_version: OutputVersionSchema.optional(),
  finish_reason: z.string().optional(),
  token_usage: TokenUsageSchema.optional(),
  model_name: z.string().optional(),
  system_fingerprint: z.string().optional(),
  id: z.string().optional(),
  service_tier: z.string().optional(),
  created_at: z.number().optional(),
  metadata: MetadataSchema.optional(),
  model: z.string().optional(),
  object: z.string().optional(),
  status: z.string().optional(),
})
export type ResponseMetadata = z.infer<typeof ResponseMetadataSchema>

// export const BrandStyleGuideSchema = z.object({
//     "style_guide": z.string(),
//     "palette": PaletteSchema,
// });
// export type BrandStyleGuide = z.infer<typeof BrandStyleGuideSchema>;

/**
 * @description The parsed data schema
 * - This is the parsed data that is returned from the LLM call
 * @warning This is run dependent and will differ from setup to setup
 */
export const ParsedSchema = z.object({
  // "website_url": z.string().optional(),
  // "business_name": z.string().optional(),
  // "user_instructions": z.string().optional(),
  // "profile": ProfileSchema.optional(),
  // "brand_style_guide": BrandStyleGuideSchema.optional(),
  // "ideas": z.array(IdeaSchema).optional(),
  // "breakdown": BreakdownSchema.optional(),
  // "shots": z.array(ShotSchema).optional(),
})
export type Parsed = z.infer<typeof ParsedSchema>

/** The additional kwargs schema this can contain useful data like parsed data if you dont stream */
export const AdditionalKwargsSchema = z.object({
  parsed: ParsedSchema.optional(),
  refusal: z.null().optional(),
})
export type AdditionalKwargs = z.infer<typeof AdditionalKwargsSchema>

/**
 * @description The tuple data you find behind the `data` field in the stream chunk
 * - This is the most important schema in this file, some of this is run dependent and will differ from setup to setup
 */
export const DataSchema = z.object({
  content: z.union([z.array(ContentElementSchema), z.string()]).optional(),
  additional_kwargs: AdditionalKwargsSchema.optional(),
  response_metadata: ResponseMetadataSchema.optional(),
  type: CreatedBySchema.optional(),
  name: z.union([z.null(), z.string()]).optional(),
  id: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  invalid_tool_calls: z.array(InvalidToolOrToolCallChunkSchema).optional(),
  usage_metadata: z.union([UsageMetadataSchema, z.null()]).optional(),
  tool_call_chunks: z.array(InvalidToolOrToolCallChunkSchema).optional(),
  chunk_position: z.union([ChunkPositionSchema, z.null()]).optional(),
  created_by: CreatedBySchema.optional(),
  graph_id: GraphIdSchema.optional(),
  assistant_id: z.string().optional(),
  run_attempt: z.number().optional(),
  langgraph_version: LanggraphVersionSchema.optional(),
  langgraph_api_version: LanggraphApiVersionSchema.optional(),
  langgraph_plan: LanggraphPlanSchema.optional(),
  langgraph_host: LanggraphHostSchema.optional(),
  langgraph_api_url: z.string().optional(),
  ideation_interrupt: z.boolean().optional(), // This is unique to this run.
  direction_interrupt: z.boolean().optional(), // This is unique to this run.
  visualizer_interrupt: z.boolean().optional(), // This is unique to this run.
  langgraph_request_id: z.string().optional(),
  run_id: z.string().optional(),
  thread_id: z.string().optional(),
  user_id: z.string().optional(),
  langgraph_step: z.number().optional(),
  langgraph_node: LanggraphNodeSchema.optional(),
  langgraph_triggers: z.array(LanggraphTriggerSchema).optional(),
  langgraph_path: z.array(z.union([z.boolean(), LanggraphNodeSchema, z.number()])).optional(),
  langgraph_checkpoint_ns: z.string().optional(),
  langgraph_auth_user_id: z.string().optional(),
  checkpoint_ns: z.string().optional(),
  ls_provider: ProviderSchema.optional(), // This is unique to this run.
  ls_model_name: LsModelNameSchema.optional(), // This is unique to this run.
  ls_model_type: LsModelTypeSchema.optional(), // This is unique to this run.
  ls_temperature: z.union([z.number(), z.null()]).optional(), // This is unique to this run.
  tags: z.array(TagSchema).optional(),
  LANGSMITH_LANGGRAPH_API_VARIANT: LangsmithLanggraphApiVariantSchema.optional(),
  LANGSMITH_PROJECT: LangsmithProjectSchema.optional(),
  tool_call_id: z.string().optional(),
  artifact: z.null().optional(), // This could be useful but may be out of this scope.
  status: z.string().optional(),
})
export type Datum = z.infer<typeof DataSchema>

export const StreamChunkSchema = z.object({
  id: z.string().optional(),
  event: EventSchema.optional(),
  data: z.union([z.array(DataSchema), z.null()]),
})
export type StreamChunk = z.infer<typeof StreamChunkSchema>
