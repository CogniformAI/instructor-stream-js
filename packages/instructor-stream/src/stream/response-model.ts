import { MODE } from '@/constants'
import {
  OAIBuildFunctionParams,
  OAIBuildJsonModeParams,
  OAIBuildJsonSchemaParams,
  OAIBuildMessageBasedParams,
  OAIBuildThinkingMessageBasedParams,
  OAIBuildToolFunctionParams,
} from './oai/params.ts'
import OpenAI from 'openai'
import * as z from 'zod'
import { Mode, ModeParamsReturnType, ResponseModel } from '@/types'

export function withResponseModel<
  T extends z.ZodType,
  M extends Mode,
  P extends OpenAI.ChatCompletionCreateParams,
>({
  response_model: { name, schema, description = '' },
  mode,
  params,
}: {
  response_model: ResponseModel<T>
  mode: M
  params: P
}): ModeParamsReturnType<P, M> {
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').replace(/\s/g, '_')
  // TODO: Align schema creation with the zod registry paradigm
  // We may be able to get a schema that is closer to what we get from Pydantic with
  // Examples and titles. We may also be able to have it align perfectly with OAI Structured
  // Outputs, for those who want that use case.
  const jsonSchema = z.toJSONSchema(schema)

  /**
   * Remove $schema field for compatibility OAI JSON Schema
   * We delete it in place no copy is made or is necessary
   */
  delete jsonSchema.$schema
  const definition = {
    name: safeName,
    description,
    ...jsonSchema,
  }
  // TODO: remove the deprecated `functions` and use tools instead
  // This can be simplified down to two modes, tools and json,
  // TOOLS are meant to be parameters that get passed to a function, with the result being passed back
  // to the model before before the turn is complete
  // JSON is meant to be json data that is passed back to the user by having only two modes
  // We can make it much easier to maintain by using an adapter pattern for the different model providers
  // input interface -> model provider adapter -> transformer -> output interface
  if (mode === MODE.FUNCTIONS) {
    return OAIBuildFunctionParams<P>(definition, params) as ModeParamsReturnType<P, M>
  }

  if (mode === MODE.TOOLS) {
    return OAIBuildToolFunctionParams<P>(definition, params) as ModeParamsReturnType<P, M>
  }

  if (mode === MODE.JSON) {
    return OAIBuildJsonModeParams<P>(definition, params) as ModeParamsReturnType<P, M>
  }

  if (mode === MODE.JSON_SCHEMA) {
    return OAIBuildJsonSchemaParams<P>(definition, params) as ModeParamsReturnType<P, M>
  }

  if (mode === MODE.MD_JSON) {
    return OAIBuildMessageBasedParams<P>(definition, params) as ModeParamsReturnType<P, M>
  }

  if (mode === MODE.THINKING_MD_JSON) {
    return OAIBuildThinkingMessageBasedParams<P>(definition, params) as ModeParamsReturnType<P, M>
  }

  return OAIBuildMessageBasedParams<P>(definition, params) as ModeParamsReturnType<P, M>
}
