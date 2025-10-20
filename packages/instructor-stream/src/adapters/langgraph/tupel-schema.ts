/**
 * @file tupel-schema.ts
 * @description This file contains zod schema created from a complete end to end langgraph run.
 * Some of the enums are variable and will differ from setup to setup. They will be marked for reference.
 * Also to note this is for the `messages-tuple` stream mode.
 */

import * as z from 'zod'

export const ChunkPositionSchema = z.enum(['last'])
export type ChunkPosition = z.infer<typeof ChunkPositionSchema>

export const IndexEnumSchema = z.enum(['lc_tc_0', 'lc_txt_0'])
export type IndexEnum = z.infer<typeof IndexEnumSchema>

export const ContentTypeSchema = z.enum(['image', 'text', 'tool_call', 'tool_call_chunk'])
export type ContentType = z.infer<typeof ContentTypeSchema>

export const CreatedBySchema = z.enum(['ai', 'AIMessageChunk', 'human', 'system', 'tool'])
export type CreatedBy = z.infer<typeof CreatedBySchema>

export const GraphIdSchema = z.enum(['cinematic_agent'])
export type GraphId = z.infer<typeof GraphIdSchema>

export const InvalidToolCallTypeSchema = z.enum(['invalid_tool_call', 'tool_call_chunk'])
export type InvalidToolCallType = z.infer<typeof InvalidToolCallTypeSchema>

export const LanggraphApiVersionSchema = z.enum(['0.4.43'])
export type LanggraphApiVersion = z.infer<typeof LanggraphApiVersionSchema>

export const LanggraphHostSchema = z.enum(['self-hosted'])
export type LanggraphHost = z.infer<typeof LanggraphHostSchema>

export const LanggraphNodeSchema = z.enum([
  'business_profile_llm_call',
  'direction_llm_call',
  'finalize_video_generation',
  'format_video_prompts',
  'generate_video_clip',
  'ideation_llm_call',
  'normalize_message_llm_call',
  '__pregel_pull',
  '__pregel_push',
  'screenshot_analysis_llm_call',
  'screenshot_llm_call',
  'screenshot_process_url',
  'screenshot_tools',
  'visualizer_llm_call',
])
export type LanggraphNode = z.infer<typeof LanggraphNodeSchema>

export const LanggraphPlanSchema = z.enum(['developer'])
export type LanggraphPlan = z.infer<typeof LanggraphPlanSchema>

export const LanggraphTriggerSchema = z.enum([
  'branch:to:business_profile_llm_call',
  'branch:to:direction_llm_call',
  'branch:to:finalize_video_generation',
  'branch:to:format_video_prompts',
  'branch:to:ideation_llm_call',
  'branch:to:normalize_message_llm_call',
  'branch:to:screenshot_analysis_llm_call',
  'branch:to:screenshot_llm_call',
  'branch:to:screenshot_process_url',
  'branch:to:screenshot_tools',
  'branch:to:visualizer_llm_call',
  '__pregel_push',
])
export type LanggraphTrigger = z.infer<typeof LanggraphTriggerSchema>

export const LanggraphVersionSchema = z.enum(['1.0.0'])
export type LanggraphVersion = z.infer<typeof LanggraphVersionSchema>

export const LangsmithLanggraphApiVariantSchema = z.enum(['local_dev'])
export type LangsmithLanggraphApiVariant = z.infer<typeof LangsmithLanggraphApiVariantSchema>

export const LangsmithProjectSchema = z.enum(['video-orchestrator-dev'])
export type LangsmithProject = z.infer<typeof LangsmithProjectSchema>

export const LsModelNameSchema = z.enum([
  'claude-haiku-4-5',
  'claude-sonnet-4-5',
  'claude-sonnet-4-5-20250929',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gpt-4.1-mini',
])
export type LsModelName = z.infer<typeof LsModelNameSchema>

export const LsModelTypeSchema = z.enum(['chat'])
export type LsModelType = z.infer<typeof LsModelTypeSchema>

export const ProviderSchema = z.enum(['anthropic', 'google_genai', 'openai'])
export type Provider = z.infer<typeof ProviderSchema>

export const ModelSchema = z.enum(['gpt-4.1-mini-2025-04-14'])
export type Model = z.infer<typeof ModelSchema>

export const ObjectEnumSchema = z.enum(['response'])
export type ObjectEnum = z.infer<typeof ObjectEnumSchema>

export const OutputVersionSchema = z.enum(['v1'])
export type OutputVersion = z.infer<typeof OutputVersionSchema>

export const ServiceTierSchema = z.enum(['default'])
export type ServiceTier = z.infer<typeof ServiceTierSchema>

export const StatusSchema = z.enum(['completed'])
export type Status = z.infer<typeof StatusSchema>

export const TagSchema = z.enum([
  'direction',
  'ideation',
  'normalization',
  'profile',
  'screenshot',
  'style_guide',
  'visualizer',
])
export type Tag = z.infer<typeof TagSchema>

export const EventSchema = z.enum(['', 'messages', 'metadata'])
export type Event = z.infer<typeof EventSchema>

export const FunctionCallSchema = z.object({
  name: z.string(),
  arguments: z.string(),
})
export type FunctionCall = z.infer<typeof FunctionCallSchema>

export const HslSchema = z.object({
  hue: z.number(),
  saturation: z.number(),
  lightness: z.number(),
})
export type Hsl = z.infer<typeof HslSchema>

export const ThemeTokensSchema = z.object({
  primary_bg: z.string(),
  primary_text: z.string(),
  secondary_bg: z.string(),
  secondary_text: z.string(),
  muted_bg: z.string(),
  muted_text: z.string(),
  accent_bg: z.string(),
  accent_text: z.string(),
})
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>

export const AudioDirectionSchema = z.object({
  music_suggestion: z.string(),
  sound_design: z.string(),
  vo_timing: z.string(),
})
export type AudioDirection = z.infer<typeof AudioDirectionSchema>

export const CameraShotSchema = z.object({
  shot_number: z.number(),
  start_time: z.number(),
  end_time: z.number(),
  content: z.string(),
  dialog: z.string(),
  on_screen_text: z.string(),
})
export type CameraShot = z.infer<typeof CameraShotSchema>

export const PersonasAndArchetypeSchema = z.object({
  name: z.string(),
  description: z.string(),
  state_in_shot: z.string(),
})
export type PersonasAndArchetype = z.infer<typeof PersonasAndArchetypeSchema>

export const VisualStyleSchema = z.object({
  style_name: z.string(),
  director_reference: z.string(),
  visual_approach: z.string(),
  color_palette: z.string(),
  camera_style: z.string(),
  lighting: z.string(),
  pacing_strategy: z.string(),
})
export type VisualStyle = z.infer<typeof VisualStyleSchema>

export const StoryBeatsSchema = z.object({
  sec_0_8: z.string(),
  sec_8_16: z.string(),
  sec_16_24: z.string(),
  sec_24_30: z.string(),
})
export type StoryBeats = z.infer<typeof StoryBeatsSchema>

export const ProfileSchema = z.object({
  business_name: z.string(),
  type_of_business: z.string(),
  founding_date: z.string(),
  founders: z.string(),
  key_milestones: z.string(),
  brand_promise_and_value_proposition: z.string(),
  key_differentiators: z.string(),
  interesting_facts_and_achievements: z.string(),
  website_url: z.string(),
  physical_address: z.string(),
  phone_number: z.string(),
  email_address: z.string(),
  summary: z.string(),
})
export type Profile = z.infer<typeof ProfileSchema>

export const ShotSchema = z.object({
  index: z.number(),
  veo_copy: z.string(),
  camera: z.string(),
  setting: z.string(),
  subjects: z.string(),
  style: z.string(),
  timeline: z.string(),
  audio: z.string(),
})
export type Shot = z.infer<typeof ShotSchema>

export const ArgsArgsSchema = z.object({
  profile: ProfileSchema,
})
export type ArgsArgs = z.infer<typeof ArgsArgsSchema>

export const ExtrasSchema = z.object({
  item_id: z.string(),
})
export type Extras = z.infer<typeof ExtrasSchema>

export const ToolCallOrInvalidToolCallSchema = z.object({
  name: z.union([z.null(), z.string()]),
  args: z.string(),
  id: z.union([z.null(), z.string()]),
  error: z.null().optional(),
  type: InvalidToolCallTypeSchema,
  index: z.union([z.number(), z.null()]).optional(),
})
export type InvalidToolCall = z.infer<typeof ToolCallOrInvalidToolCallSchema>

export const GroundingMetadataSchema = z.object({})
export type GroundingMetadata = z.infer<typeof GroundingMetadataSchema>

export const ArgsBreakdownSchema = z.object({
  visual_style: GroundingMetadataSchema,
})
export type ArgsBreakdown = z.infer<typeof ArgsBreakdownSchema>

export const InputTokenDetailsSchema = z.object({
  cache_read: z.number(),
  cache_creation: z.number().optional(),
  audio: z.number().optional(),
})
export type InputTokenDetails = z.infer<typeof InputTokenDetailsSchema>

export const OutputTokenDetailsSchema = z.object({
  reasoning: z.number(),
  audio: z.number().optional(),
})
export type OutputTokenDetails = z.infer<typeof OutputTokenDetailsSchema>

export const DataSchemaAlt = z.object({
  run_id: z.string(),
  attempt: z.number(),
})
export type DataAlt = z.infer<typeof DataSchemaAlt>

export const ColorSchema = z.object({
  name: z.string(),
  hex: z.string(),
  rgb: z.array(z.number()),
  hsl: HslSchema,
  recommended_text: z.union([z.null(), z.string()]),
  contrast_with_recommended: z.union([z.number(), z.null()]),
  wcag_AA_ok: z.union([z.boolean(), z.null()]),
})
export type Color = z.infer<typeof ColorSchema>

export const ParsedBreakdownSchema = z.object({
  visual_style: VisualStyleSchema,
  personas_and_archetypes: z.array(PersonasAndArchetypeSchema),
  camera_shots: z.array(CameraShotSchema),
  audio_direction: AudioDirectionSchema,
})
export type ParsedBreakdown = z.infer<typeof ParsedBreakdownSchema>

export const IdeaSchema = z.object({
  name: z.string(),
  concept: z.string(),
  strategy: z.string(),
  emotion: z.string(),
  big_idea: z.string(),
  story_beats: StoryBeatsSchema,
})
export type Idea = z.infer<typeof IdeaSchema>

/**
 * This is the new unified Content Block from LangChain and is what we care about working correctly
 */
export const ContentBlockSchema = z.object({
  type: ContentTypeSchema,
  text: z.string().optional(),
  index: z.union([IndexEnumSchema, z.number()]).optional(),
  id: z.union([z.null(), z.string()]).optional(),
  name: z.union([z.null(), z.string()]).optional(),
  args: z.union([ArgsArgsSchema, z.string()]).optional(),
  extras: ExtrasSchema.optional(),
  url: z.string().optional(),
})
export type ContentBlock = z.infer<typeof ContentBlockSchema>

export const ResponseMetadataSchema = z.object({
  model_provider: ProviderSchema.optional(),
  id: z.string().optional(),
  output_version: OutputVersionSchema.optional(),
  created_at: z.number().optional(),
  metadata: GroundingMetadataSchema.optional(),
  model: ModelSchema.optional(),
  object: ObjectEnumSchema.optional(),
  service_tier: ServiceTierSchema.optional(),
  status: StatusSchema.optional(),
  model_name: z.string().optional(),
  safety_ratings: z.array(z.any()).optional(),
  grounding_metadata: GroundingMetadataSchema.optional(),
  finish_reason: z.string().optional(),
  stop_reason: z.string().optional(),
  stop_sequence: z.null().optional(),
  system_fingerprint: z.string().optional(),
})
export type ResponseMetadata = z.infer<typeof ResponseMetadataSchema>

export const ToolCallArgsSchema = z.object({
  profile: ProfileSchema.optional(),
  breakdown: ArgsBreakdownSchema.optional(),
  shot_number: z.number().optional(),
  shots: z.array(GroundingMetadataSchema).optional(),
  index: z.number().optional(),
})
export type ToolCallArgs = z.infer<typeof ToolCallArgsSchema>

export const UsageMetadataSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number(),
  input_token_details: InputTokenDetailsSchema,
  output_token_details: OutputTokenDetailsSchema.optional(),
})
export type UsageMetadata = z.infer<typeof UsageMetadataSchema>

export const PaletteSchema = z.object({
  colors: z.array(ColorSchema),
  css_vars: z.string(),
  theme_tokens: ThemeTokensSchema,
})
export type Palette = z.infer<typeof PaletteSchema>

export const ToolCallSchema = z.object({
  name: z.string(),
  args: ToolCallArgsSchema,
  id: z.union([z.null(), z.string()]),
  type: ContentTypeSchema,
})
export type ToolCall = z.infer<typeof ToolCallSchema>

export const BrandStyleGuideSchema = z.object({
  style_guide: z.string(),
  palette: PaletteSchema,
})
export type BrandStyleGuide = z.infer<typeof BrandStyleGuideSchema>

export const ParsedSchema = z.object({
  website_url: z.string().optional(),
  business_name: z.string().optional(),
  user_instructions: z.string().optional(),
  brand_style_guide: BrandStyleGuideSchema.optional(),
  profile: ProfileSchema.optional(),
  ideas: z.array(IdeaSchema).optional(),
  breakdown: ParsedBreakdownSchema.optional(),
  shots: z.array(ShotSchema).optional(),
})
export type Parsed = z.infer<typeof ParsedSchema>

export const AdditionalKwargsSchema = z.object({
  parsed: ParsedSchema.optional(),
  function_call: FunctionCallSchema.optional(),
})
export type AdditionalKwargs = z.infer<typeof AdditionalKwargsSchema>

export const DataSchema = z.object({
  content: z.union([z.array(ContentBlockSchema), z.string()]).optional(),
  additional_kwargs: AdditionalKwargsSchema.optional(),
  response_metadata: ResponseMetadataSchema.optional(),
  type: CreatedBySchema.optional(),
  name: z.union([z.null(), z.string()]).optional(),
  id: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  invalid_tool_calls: z.array(ToolCallOrInvalidToolCallSchema).optional(),
  usage_metadata: z.union([UsageMetadataSchema, z.null()]).optional(),
  tool_call_chunks: z.array(ToolCallOrInvalidToolCallSchema).optional(),
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
  ideation_interrupt: z.boolean().optional(),
  direction_interrupt: z.boolean().optional(),
  visualizer_interrupt: z.boolean().optional(),
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
  ls_provider: ProviderSchema.optional(),
  ls_model_name: LsModelNameSchema.optional(),
  ls_model_type: LsModelTypeSchema.optional(),
  ls_temperature: z.union([z.number(), z.null()]).optional(),
  tags: z.array(TagSchema).optional(),
  LANGSMITH_LANGGRAPH_API_VARIANT: LangsmithLanggraphApiVariantSchema.optional(),
  LANGSMITH_PROJECT: LangsmithProjectSchema.optional(),
  tool_call_id: z.string().optional(),
  artifact: z.null().optional(),
  status: z.string().optional(),
  ls_max_tokens: z.number().optional(),
  test_mode: z.boolean().optional(),
})
export type Data = z.infer<typeof DataSchema>

export const CompleteStreamSchema = z.object({
  type: z.string().optional(),
  thread_id: z.string().optional(),
  project_id: z.string().optional(),
  id: z.string().optional(),
  event: EventSchema.optional(),
  data: z.union([z.array(DataSchema), DataSchemaAlt, z.null()]).optional(),
})
export type CompleteStream = z.infer<typeof CompleteStreamSchema>
