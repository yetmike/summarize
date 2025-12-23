import { describe, expect, it } from 'vitest'

import type { SummarizeConfig } from '../src/config.js'
import { buildAutoModelAttempts } from '../src/model-auto.js'

describe('auto model selection', () => {
  it('preserves candidate order (native then OpenRouter fallback)', () => {
    const config: SummarizeConfig = {
      model: {
        mode: 'auto',
        rules: [{ candidates: ['openai/gpt-5-mini', 'xai/grok-4-fast-non-reasoning'] }],
      },
    }
    const attempts = buildAutoModelAttempts({
      mode: 'auto',
      kind: 'text',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: { OPENROUTER_API_KEY: 'sk-or-test' },
      config,
      catalog: null,
      openrouterProvidersFromEnv: null,
    })

    expect(attempts[0]?.userModelId).toBe('openai/gpt-5-mini')
    expect(attempts[1]?.userModelId).toBe('openrouter/openai/gpt-5-mini')
    expect(attempts[2]?.userModelId).toBe('xai/grok-4-fast-non-reasoning')
    expect(attempts[3]?.userModelId).toBe('openrouter/xai/grok-4-fast-non-reasoning')
  })

  it('adds an OpenRouter fallback attempt when OPENROUTER_API_KEY is set', () => {
    const config: SummarizeConfig = {
      model: { mode: 'auto', rules: [{ candidates: ['openai/gpt-5-mini'] }] },
    }
    const attempts = buildAutoModelAttempts({
      mode: 'auto',
      kind: 'text',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: { OPENROUTER_API_KEY: 'sk-or-test' },
      config,
      catalog: null,
      openrouterProvidersFromEnv: ['groq'],
    })

    expect(attempts.some((a) => a.forceOpenRouter)).toBe(true)
    expect(attempts.some((a) => a.userModelId === 'openai/gpt-5-mini')).toBe(true)
    expect(attempts.some((a) => a.userModelId === 'openrouter/openai/gpt-5-mini')).toBe(true)
  })

  it('does not add an OpenRouter fallback when video understanding is required', () => {
    const config: SummarizeConfig = {
      model: { mode: 'auto', rules: [{ candidates: ['google/gemini-3-flash-preview'] }] },
    }
    const attempts = buildAutoModelAttempts({
      mode: 'auto',
      kind: 'video',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: true,
      env: { OPENROUTER_API_KEY: 'sk-or-test' },
      config,
      catalog: null,
      openrouterProvidersFromEnv: ['groq'],
    })

    expect(attempts.every((a) => a.forceOpenRouter === false)).toBe(true)
  })

  it('respects explicit openrouter/... candidates (no native attempt)', () => {
    const config: SummarizeConfig = {
      model: { mode: 'auto', rules: [{ candidates: ['openrouter/openai/gpt-5-nano'] }] },
    }
    const attempts = buildAutoModelAttempts({
      mode: 'auto',
      kind: 'text',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: { OPENROUTER_API_KEY: 'sk-or-test' },
      config,
      catalog: null,
      openrouterProvidersFromEnv: null,
    })

    expect(attempts.some((a) => a.userModelId === 'openrouter/openai/gpt-5-nano')).toBe(true)
    expect(attempts.some((a) => a.userModelId === 'openai/gpt-5-nano')).toBe(false)
  })

  it('treats OpenRouter model ids as opaque (meta-llama/... etc)', () => {
    const config: SummarizeConfig = {
      model: {
        mode: 'auto',
        rules: [{ candidates: ['openrouter/meta-llama/llama-3.1-8b-instruct:free'] }],
      },
    }
    const attempts = buildAutoModelAttempts({
      mode: 'auto',
      kind: 'text',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: { OPENROUTER_API_KEY: 'sk-or-test' },
      config,
      catalog: null,
      openrouterProvidersFromEnv: null,
    })

    expect(attempts[0]?.userModelId).toBe('openrouter/meta-llama/llama-3.1-8b-instruct:free')
    expect(attempts[0]?.llmModelId).toBe('openai/meta-llama/llama-3.1-8b-instruct:free')
  })

  it('selects candidates via token bands (first match wins)', () => {
    const config: SummarizeConfig = {
      model: {
        mode: 'auto',
        rules: [
          {
            when: ['text'],
            bands: [
              { token: { max: 100 }, candidates: ['openai/gpt-5-nano'] },
              { token: { max: 1000 }, candidates: ['openai/gpt-5-mini'] },
              { candidates: ['xai/grok-4-fast-non-reasoning'] },
            ],
          },
        ],
      },
    }

    const attempts = buildAutoModelAttempts({
      mode: 'auto',
      kind: 'text',
      promptTokens: 200,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: {},
      config,
      catalog: null,
      openrouterProvidersFromEnv: null,
    })

    expect(attempts[0]?.userModelId).toBe('openai/gpt-5-mini')
  })

  it('free mode only keeps openrouter/...:free candidates', () => {
    const config: SummarizeConfig = {
      model: {
        mode: 'free',
        rules: [
          {
            candidates: ['openrouter/deepseek/deepseek-r1:free', 'openrouter/deepseek/deepseek-r1'],
          },
        ],
      },
    }

    const attempts = buildAutoModelAttempts({
      mode: 'free',
      kind: 'website',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: { OPENROUTER_API_KEY: 'sk-or-test' },
      config,
      catalog: null,
      openrouterProvidersFromEnv: null,
    })

    expect(attempts).toHaveLength(1)
    expect(attempts[0]?.userModelId).toBe('openrouter/deepseek/deepseek-r1:free')
    expect(attempts[0]?.forceOpenRouter).toBe(true)
  })

  it('filters candidates by LiteLLM max input tokens (skips too-small context)', () => {
    const config: SummarizeConfig = {
      model: {
        mode: 'auto',
        rules: [{ candidates: ['openai/gpt-5-nano', 'openai/gpt-5-mini'] }],
      },
    }

    const catalog = {
      'gpt-5-nano': { max_input_tokens: 10 },
      'gpt-5-mini': { max_input_tokens: 1000 },
    }

    const attempts = buildAutoModelAttempts({
      mode: 'auto',
      kind: 'text',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: { OPENAI_API_KEY: 'test' },
      config,
      catalog,
      openrouterProvidersFromEnv: null,
    })

    expect(attempts[0]?.userModelId).toBe('openai/gpt-5-mini')
  })

  it('supports multi-kind "when" arrays', () => {
    const config: SummarizeConfig = {
      model: {
        mode: 'auto',
        rules: [
          { when: ['youtube', 'website'], candidates: ['openai/gpt-5-nano'] },
          { when: ['text'], candidates: ['openai/gpt-5-mini'] },
        ],
      },
    }

    const attemptsWebsite = buildAutoModelAttempts({
      mode: 'auto',
      kind: 'website',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: { OPENAI_API_KEY: 'test' },
      config,
      catalog: null,
      openrouterProvidersFromEnv: null,
    })
    expect(attemptsWebsite[0]?.userModelId).toBe('openai/gpt-5-nano')

    const attemptsText = buildAutoModelAttempts({
      mode: 'auto',
      kind: 'text',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: { OPENAI_API_KEY: 'test' },
      config,
      catalog: null,
      openrouterProvidersFromEnv: null,
    })
    expect(attemptsText[0]?.userModelId).toBe('openai/gpt-5-mini')
  })

  it('prepends default CLI candidates when available', () => {
    const attempts = buildAutoModelAttempts({
      mode: 'auto',
      kind: 'text',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: {},
      config: null,
      catalog: null,
      openrouterProvidersFromEnv: null,
      cliAvailability: { claude: true, codex: true, gemini: true },
    })

    expect(attempts[0]?.userModelId).toBe('cli/claude/sonnet')
    expect(attempts[1]?.userModelId).toBe('cli/gemini/gemini-3-flash-preview')
    expect(attempts[2]?.userModelId).toBe('cli/codex/gpt-5.2')
  })

  it('can disable CLI prepending via config', () => {
    const config: SummarizeConfig = {
      cli: { prefer: false },
      model: { mode: 'auto', rules: [{ candidates: ['openai/gpt-5-mini'] }] },
    }
    const attempts = buildAutoModelAttempts({
      mode: 'auto',
      kind: 'text',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: {},
      config,
      catalog: null,
      openrouterProvidersFromEnv: null,
      cliAvailability: { claude: true },
    })

    expect(attempts[0]?.userModelId).toBe('openai/gpt-5-mini')
  })
})
