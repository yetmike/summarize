import { describe, expect, it, vi } from 'vitest'

import { resolveGoogleModelForUsage } from '../src/llm/google-models.js'

describe('google model resolution (Gemini API ListModels)', () => {
  it('resolves -preview suffix when the non-preview model exists', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      expect(url).toContain('generativelanguage.googleapis.com/v1beta/models')
      return new Response(
        JSON.stringify({
          models: [
            {
              name: 'models/gemini-3.0-flash',
              supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    })

    const result = await resolveGoogleModelForUsage({
      requestedModelId: 'gemini-3.0-flash-preview',
      apiKey: 'test',
      fetchImpl: fetchMock as unknown as typeof fetch,
      timeoutMs: 2000,
      requireMethod: 'streamGenerateContent',
    })

    expect(result.resolvedModelId).toBe('gemini-3.0-flash')
    expect(result.note).toMatch(/Resolved/i)
  })

  it('throws a helpful error with suggestions when model is missing', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          models: [
            {
              name: 'models/gemini-2.0-flash',
              supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
            },
            {
              name: 'models/gemini-2.0-pro',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    })

    await expect(
      resolveGoogleModelForUsage({
        requestedModelId: 'gemini-3.0-flash-preview',
        apiKey: 'test',
        fetchImpl: fetchMock as unknown as typeof fetch,
        timeoutMs: 2000,
        requireMethod: 'streamGenerateContent',
      })
    ).rejects.toThrow(/Try one of:/)
  })

  it('surfaces ListModels failures as actionable key/config errors', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('{"error":{"message":"bad key"}}', {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    })

    await expect(
      resolveGoogleModelForUsage({
        requestedModelId: 'gemini-3.0-flash-preview',
        apiKey: 'bad',
        fetchImpl: fetchMock as unknown as typeof fetch,
        timeoutMs: 2000,
        requireMethod: 'streamGenerateContent',
      })
    ).rejects.toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/i)
  })
})
