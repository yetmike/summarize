import { normalizeGatewayStyleModelId, parseGatewayStyleModelId } from './llm/model-id.js'

export type FixedModelSpec =
  | {
      transport: 'native'
      userModelId: string
      llmModelId: string
      provider: 'xai' | 'openai' | 'google' | 'anthropic'
      openrouterProviders: string[] | null
      forceOpenRouter: false
      requiredEnv: 'XAI_API_KEY' | 'OPENAI_API_KEY' | 'GEMINI_API_KEY' | 'ANTHROPIC_API_KEY'
    }
  | {
      transport: 'openrouter'
      userModelId: string
      openrouterModelId: string
      llmModelId: string
      openrouterProviders: string[] | null
      forceOpenRouter: true
      requiredEnv: 'OPENROUTER_API_KEY'
    }

export type RequestedModel =
  | { kind: 'auto' }
  | { kind: 'free' }
  | ({ kind: 'fixed' } & FixedModelSpec)

export function parseRequestedModelId(raw: string): RequestedModel {
  const trimmed = raw.trim()
  if (trimmed.length === 0) throw new Error('Missing model id')

  const lower = trimmed.toLowerCase()
  if (lower === 'auto') return { kind: 'auto' }
  if (lower === 'free' || lower === '3') return { kind: 'free' }

  if (lower.startsWith('openrouter/')) {
    const openrouterModelId = trimmed.slice('openrouter/'.length).trim()
    if (openrouterModelId.length === 0) {
      throw new Error('Invalid model id: openrouter/… is missing the OpenRouter model id')
    }
    if (!openrouterModelId.includes('/')) {
      throw new Error(
        `Invalid OpenRouter model id "${openrouterModelId}". Expected "author/slug" (e.g. "openai/gpt-5-nano").`
      )
    }
    return {
      kind: 'fixed',
      transport: 'openrouter',
      userModelId: `openrouter/${openrouterModelId}`,
      openrouterModelId,
      llmModelId: `openai/${openrouterModelId}`,
      openrouterProviders: null,
      forceOpenRouter: true,
      requiredEnv: 'OPENROUTER_API_KEY',
    }
  }

  const userModelId = normalizeGatewayStyleModelId(trimmed)
  const parsed = parseGatewayStyleModelId(userModelId)
  const requiredEnv =
    parsed.provider === 'xai'
      ? 'XAI_API_KEY'
      : parsed.provider === 'google'
        ? 'GEMINI_API_KEY'
        : parsed.provider === 'anthropic'
          ? 'ANTHROPIC_API_KEY'
          : 'OPENAI_API_KEY'
  return {
    kind: 'fixed',
    transport: 'native',
    userModelId,
    llmModelId: userModelId,
    provider: parsed.provider,
    openrouterProviders: null,
    forceOpenRouter: false,
    requiredEnv,
  }
}
