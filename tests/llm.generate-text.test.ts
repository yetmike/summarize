import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateTextWithModelId, streamTextWithModelId } from '../src/llm/generate-text.js'

const generateTextMock = vi.fn(async () => ({
  text: 'ok',
  usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
}))
const streamTextMock = vi.fn(() => ({
  textStream: {
    async *[Symbol.asyncIterator]() {
      yield 'o'
      yield 'k'
    },
  },
  totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 2, totalTokens: 3 }),
}))

vi.mock('ai', () => ({
  generateText: generateTextMock,
  streamText: streamTextMock,
}))

const openaiFactoryMock = vi.fn((options: Record<string, unknown>) => {
  const responsesModel = (_modelId: string) => ({ kind: 'responses', options })
  const chatModel = (_modelId: string) => ({ kind: 'chat', options })
  return Object.assign(responsesModel, { chat: chatModel })
})

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: openaiFactoryMock,
}))
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: () => (_modelId: string) => ({}),
}))
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: () => (_modelId: string) => ({}),
}))
vi.mock('@ai-sdk/xai', () => ({
  createXai: () => (_modelId: string) => ({}),
}))

describe('llm generate/stream', () => {
  const originalBaseUrl = process.env.OPENAI_BASE_URL

  afterEach(() => {
    openaiFactoryMock.mockClear()
    process.env.OPENAI_BASE_URL = originalBaseUrl
  })

  it('routes by provider (generateText) and includes maxOutputTokens when set', async () => {
    generateTextMock.mockClear()
    await generateTextWithModelId({
      modelId: 'xai/grok-4-fast-non-reasoning',
      apiKeys: {
        xaiApiKey: 'k',
        openaiApiKey: null,
        googleApiKey: null,
        anthropicApiKey: null,
        openrouterApiKey: null,
      },
      prompt: 'hi',
      timeoutMs: 2000,
      fetchImpl: globalThis.fetch.bind(globalThis),
      maxOutputTokens: 7,
    })
    await generateTextWithModelId({
      modelId: 'google/gemini-3-flash-preview',
      apiKeys: {
        xaiApiKey: null,
        openaiApiKey: null,
        googleApiKey: 'k',
        anthropicApiKey: null,
        openrouterApiKey: null,
      },
      prompt: 'hi',
      timeoutMs: 2000,
      fetchImpl: globalThis.fetch.bind(globalThis),
      maxOutputTokens: 7,
    })
    await generateTextWithModelId({
      modelId: 'anthropic/claude-opus-4-5',
      apiKeys: {
        xaiApiKey: null,
        openaiApiKey: null,
        googleApiKey: null,
        anthropicApiKey: 'k',
        openrouterApiKey: null,
      },
      prompt: 'hi',
      timeoutMs: 2000,
      fetchImpl: globalThis.fetch.bind(globalThis),
      maxOutputTokens: 7,
    })
    await generateTextWithModelId({
      modelId: 'openai/gpt-5.2',
      apiKeys: {
        openaiApiKey: 'k',
        xaiApiKey: null,
        googleApiKey: null,
        anthropicApiKey: null,
        openrouterApiKey: null,
      },
      prompt: 'hi',
      timeoutMs: 2000,
      fetchImpl: globalThis.fetch.bind(globalThis),
      maxOutputTokens: 7,
    })
    expect(generateTextMock).toHaveBeenCalledTimes(4)
    for (const call of generateTextMock.mock.calls) {
      const args = (call?.[0] ?? {}) as Record<string, unknown>
      expect(args).toHaveProperty('maxOutputTokens', 7)
    }
  })

  it('routes by provider (streamText) and includes maxOutputTokens when set', async () => {
    streamTextMock.mockClear()
    await streamTextWithModelId({
      modelId: 'xai/grok-4-fast-non-reasoning',
      apiKeys: {
        xaiApiKey: 'k',
        openaiApiKey: null,
        googleApiKey: null,
        anthropicApiKey: null,
        openrouterApiKey: null,
      },
      prompt: 'hi',
      timeoutMs: 2000,
      fetchImpl: globalThis.fetch.bind(globalThis),
      maxOutputTokens: 9,
    })
    await streamTextWithModelId({
      modelId: 'google/gemini-3-flash-preview',
      apiKeys: {
        xaiApiKey: null,
        openaiApiKey: null,
        googleApiKey: 'k',
        anthropicApiKey: null,
        openrouterApiKey: null,
      },
      prompt: 'hi',
      timeoutMs: 2000,
      fetchImpl: globalThis.fetch.bind(globalThis),
      maxOutputTokens: 9,
    })
    await streamTextWithModelId({
      modelId: 'anthropic/claude-opus-4-5',
      apiKeys: {
        xaiApiKey: null,
        openaiApiKey: null,
        googleApiKey: null,
        anthropicApiKey: 'k',
        openrouterApiKey: null,
      },
      prompt: 'hi',
      timeoutMs: 2000,
      fetchImpl: globalThis.fetch.bind(globalThis),
      maxOutputTokens: 9,
    })
    await streamTextWithModelId({
      modelId: 'openai/gpt-5.2',
      apiKeys: {
        openaiApiKey: 'k',
        xaiApiKey: null,
        googleApiKey: null,
        anthropicApiKey: null,
        openrouterApiKey: null,
      },
      prompt: 'hi',
      timeoutMs: 2000,
      fetchImpl: globalThis.fetch.bind(globalThis),
      maxOutputTokens: 9,
    })
    expect(streamTextMock).toHaveBeenCalledTimes(4)
    for (const call of streamTextMock.mock.calls) {
      const args = (call?.[0] ?? {}) as Record<string, unknown>
      expect(args).toHaveProperty('maxOutputTokens', 9)
    }
  })

  it('omits maxOutputTokens when undefined (generateText)', async () => {
    generateTextMock.mockClear()
    await generateTextWithModelId({
      modelId: 'openai/gpt-5.2',
      apiKeys: {
        openaiApiKey: 'k',
        xaiApiKey: null,
        googleApiKey: null,
        anthropicApiKey: null,
        openrouterApiKey: null,
      },
      prompt: 'hi',
      timeoutMs: 2000,
      fetchImpl: globalThis.fetch.bind(globalThis),
    })
    const args = generateTextMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(args).not.toHaveProperty('maxOutputTokens')
  })

  it('omits maxOutputTokens when undefined (streamText)', async () => {
    streamTextMock.mockClear()
    const result = await streamTextWithModelId({
      modelId: 'openai/gpt-5.2',
      apiKeys: {
        openaiApiKey: 'k',
        xaiApiKey: null,
        googleApiKey: null,
        anthropicApiKey: null,
        openrouterApiKey: null,
      },
      prompt: 'hi',
      timeoutMs: 2000,
      fetchImpl: globalThis.fetch.bind(globalThis),
    })
    const args = streamTextMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(args).not.toHaveProperty('maxOutputTokens')
    let out = ''
    for await (const chunk of result.textStream) out += chunk
    expect(out).toBe('ok')
    expect(await result.usage).toEqual({ promptTokens: 1, completionTokens: 2, totalTokens: 3 })
  })

  it('throws a friendly timeout error on AbortError', async () => {
    generateTextMock.mockImplementationOnce(async () => {
      throw new DOMException('aborted', 'AbortError')
    })
    await expect(
      generateTextWithModelId({
        modelId: 'openai/gpt-5.2',
        apiKeys: {
          openaiApiKey: 'k',
          xaiApiKey: null,
          googleApiKey: null,
          anthropicApiKey: null,
          openrouterApiKey: null,
        },
        prompt: 'hi',
        timeoutMs: 1,
        fetchImpl: globalThis.fetch.bind(globalThis),
        maxOutputTokens: 10,
      })
    ).rejects.toThrow(/timed out/i)
  })

  it('retries once when the model returns an empty output', async () => {
    generateTextMock.mockClear()
    generateTextMock.mockImplementationOnce(async () => ({
      text: '   ',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    }))
    generateTextMock.mockImplementationOnce(async () => ({
      text: 'ok',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    }))

    const result = await generateTextWithModelId({
      modelId: 'openai/gpt-5.2',
      apiKeys: {
        openaiApiKey: 'k',
        xaiApiKey: null,
        googleApiKey: null,
        anthropicApiKey: null,
        openrouterApiKey: null,
      },
      prompt: 'hi',
      timeoutMs: 2000,
      fetchImpl: globalThis.fetch.bind(globalThis),
      maxOutputTokens: 10,
      retries: 1,
    })

    expect(result.text).toBe('ok')
    expect(generateTextMock).toHaveBeenCalledTimes(2)
  })

  it('enforces missing-key errors per provider', async () => {
    await expect(
      generateTextWithModelId({
        modelId: 'google/gemini-3-flash-preview',
        apiKeys: {
          openaiApiKey: null,
          xaiApiKey: null,
          googleApiKey: null,
          anthropicApiKey: null,
          openrouterApiKey: null,
        },
        prompt: 'hi',
        timeoutMs: 2000,
        fetchImpl: globalThis.fetch.bind(globalThis),
        maxOutputTokens: 10,
      })
    ).rejects.toThrow(/GEMINI_API_KEY/i)

    await expect(
      generateTextWithModelId({
        modelId: 'xai/grok-4-fast-non-reasoning',
        apiKeys: {
          openaiApiKey: null,
          xaiApiKey: null,
          googleApiKey: null,
          anthropicApiKey: null,
          openrouterApiKey: null,
        },
        prompt: 'hi',
        timeoutMs: 2000,
        fetchImpl: globalThis.fetch.bind(globalThis),
        maxOutputTokens: 10,
      })
    ).rejects.toThrow(/XAI_API_KEY/i)

    await expect(
      generateTextWithModelId({
        modelId: 'anthropic/claude-opus-4-5',
        apiKeys: {
          openaiApiKey: null,
          xaiApiKey: null,
          googleApiKey: null,
          anthropicApiKey: null,
          openrouterApiKey: null,
        },
        prompt: 'hi',
        timeoutMs: 2000,
        fetchImpl: globalThis.fetch.bind(globalThis),
        maxOutputTokens: 10,
      })
    ).rejects.toThrow(/ANTHROPIC_API_KEY/i)
  })

  it('respects OPENAI_BASE_URL and skips OpenRouter headers for non-OpenRouter base URLs', async () => {
    process.env.OPENAI_BASE_URL = 'https://openai.example.com/v1'
    generateTextMock.mockClear()

    const fetchImpl = vi.fn(async () => new Response('ok'))

    await generateTextWithModelId({
      modelId: 'openai/gpt-5.2',
      apiKeys: {
        openaiApiKey: 'openai-key',
        openrouterApiKey: 'openrouter-key',
        xaiApiKey: null,
        googleApiKey: null,
        anthropicApiKey: null,
      },
      prompt: 'hi',
      timeoutMs: 2000,
      fetchImpl,
      openrouter: { providers: ['groq', 'google-vertex'] },
    })

    const openaiOptions = openaiFactoryMock.mock.calls[0]?.[0] as {
      baseURL?: string
      fetch?: typeof fetch
    }
    expect(openaiOptions.baseURL).toBe('https://openai.example.com/v1')
    expect(openaiOptions.fetch).toBe(fetchImpl)

    const args = generateTextMock.mock.calls[0]?.[0] as { model?: { kind?: string } }
    expect(args.model?.kind).toBe('responses')
  })

  it('adds OpenRouter headers and forces chat completions when OPENROUTER_API_KEY is set', async () => {
    delete process.env.OPENAI_BASE_URL
    generateTextMock.mockClear()

    const fetchImpl = vi.fn(async () => new Response('ok'))

    await generateTextWithModelId({
      modelId: 'openai/openai/gpt-oss-20b',
      apiKeys: {
        openaiApiKey: null,
        openrouterApiKey: 'openrouter-key',
        xaiApiKey: null,
        googleApiKey: null,
        anthropicApiKey: null,
      },
      prompt: 'hi',
      timeoutMs: 2000,
      fetchImpl,
      openrouter: { providers: ['groq', 'google-vertex'] },
    })

    const openaiOptions = openaiFactoryMock.mock.calls[0]?.[0] as {
      baseURL?: string
      fetch?: typeof fetch
    }
    expect(openaiOptions.baseURL).toBe('https://openrouter.ai/api/v1')
    expect(openaiOptions.fetch).not.toBe(fetchImpl)

    await openaiOptions.fetch?.('https://example.com', {
      headers: new Headers({ 'X-Test': '1' }),
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const headers = new Headers((fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined)?.headers)
    expect(headers.get('X-Test')).toBe('1')
    expect(headers.get('HTTP-Referer')).toBe('https://github.com/steipete/summarize')
    expect(headers.get('X-Title')).toBe('summarize')
    expect(headers.get('X-OpenRouter-Provider-Order')).toBe('groq,google-vertex')

    const args = generateTextMock.mock.calls[0]?.[0] as { model?: { kind?: string } }
    expect(args.model?.kind).toBe('chat')
  })

  it('wraps anthropic model access errors with a helpful message', async () => {
    generateTextMock.mockImplementationOnce(async () => {
      const error = Object.assign(new Error('model: claude-3-5-sonnet-latest'), {
        statusCode: 404,
        responseBody: JSON.stringify({
          type: 'error',
          error: { type: 'not_found_error', message: 'model: claude-3-5-sonnet-latest' },
        }),
      })
      throw error
    })

    await expect(
      generateTextWithModelId({
        modelId: 'anthropic/claude-3-5-sonnet-latest',
        apiKeys: {
          xaiApiKey: null,
          openaiApiKey: null,
          googleApiKey: null,
          anthropicApiKey: 'k',
          openrouterApiKey: null,
        },
        prompt: 'hi',
        timeoutMs: 2000,
        fetchImpl: globalThis.fetch.bind(globalThis),
        maxOutputTokens: 10,
      })
    ).rejects.toThrow(/Anthropic API rejected model "claude-3-5-sonnet-latest"/i)

    streamTextMock.mockImplementationOnce(() => {
      const error = Object.assign(new Error('model: claude-3-5-sonnet-latest'), {
        statusCode: 403,
        responseBody: JSON.stringify({
          type: 'error',
          error: { type: 'permission_error', message: 'model: claude-3-5-sonnet-latest' },
        }),
      })
      throw error
    })

    await expect(
      streamTextWithModelId({
        modelId: 'anthropic/claude-3-5-sonnet-latest',
        apiKeys: {
          xaiApiKey: null,
          openaiApiKey: null,
          googleApiKey: null,
          anthropicApiKey: 'k',
          openrouterApiKey: null,
        },
        prompt: 'hi',
        timeoutMs: 2000,
        fetchImpl: globalThis.fetch.bind(globalThis),
        maxOutputTokens: 10,
      })
    ).rejects.toThrow(/Anthropic API rejected model "claude-3-5-sonnet-latest"/i)
  })

  it('throws a friendly timeout error on AbortError (streamText)', async () => {
    streamTextMock.mockImplementationOnce(() => {
      throw new DOMException('aborted', 'AbortError')
    })
    await expect(
      streamTextWithModelId({
        modelId: 'openai/gpt-5.2',
        apiKeys: {
          openaiApiKey: 'k',
          xaiApiKey: null,
          googleApiKey: null,
          anthropicApiKey: null,
          openrouterApiKey: null,
        },
        prompt: 'hi',
        timeoutMs: 1,
        fetchImpl: globalThis.fetch.bind(globalThis),
        maxOutputTokens: 10,
      })
    ).rejects.toThrow(/timed out/i)
  })

  it('times out when a stream stalls before yielding', async () => {
    streamTextMock.mockImplementationOnce(() => ({
      textStream: {
        async *[Symbol.asyncIterator]() {
          await new Promise(() => {})
        },
      },
      totalUsage: new Promise(() => {}),
    }))
    const result = await streamTextWithModelId({
      modelId: 'openai/gpt-5.2',
      apiKeys: {
        openaiApiKey: 'k',
        xaiApiKey: null,
        googleApiKey: null,
        anthropicApiKey: null,
        openrouterApiKey: null,
      },
      prompt: 'hi',
      timeoutMs: 5,
      fetchImpl: globalThis.fetch.bind(globalThis),
      maxOutputTokens: 10,
    })
    const iterator = result.textStream[Symbol.asyncIterator]()
    const nextPromise = iterator.next()
    await expect(nextPromise).rejects.toThrow(/timed out/i)
  }, 250)
})
