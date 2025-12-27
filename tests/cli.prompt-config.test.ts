import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

import { runCli } from '../src/run.js'

const htmlResponse = (html: string, status = 200) =>
  new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html' },
  })

function collectStream() {
  let text = ''
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString()
      callback()
    },
  })
  return { stream, getText: () => text }
}

function createTextStream(chunks: string[]): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

const streamTextMock = vi.fn(() => {
  return {
    textStream: createTextStream(['OK']),
    totalUsage: Promise.resolve({ promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
  }
})

vi.mock('ai', () => ({
  streamText: streamTextMock,
}))

const createOpenAIMock = vi.fn(() => {
  return (_modelId: string) => ({})
})

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAIMock,
}))

describe('config prompt', () => {
  it('uses config.prompt when --prompt is absent', async () => {
    streamTextMock.mockClear()

    const root = mkdtempSync(join(tmpdir(), 'summarize-prompt-'))
    const summarizeDir = join(root, '.summarize')
    const cacheDir = join(summarizeDir, 'cache')
    mkdirSync(cacheDir, { recursive: true })

    writeFileSync(
      join(summarizeDir, 'config.json'),
      JSON.stringify({ prompt: 'Explain for a kid.' }),
      'utf8'
    )

    // LiteLLM cache: used for model limits; avoid network fetch in tests
    writeFileSync(
      join(cacheDir, 'litellm-model_prices_and_context_window.json'),
      JSON.stringify({ 'gpt-5.2': { max_input_tokens: 999_999 } }),
      'utf8'
    )
    writeFileSync(
      join(cacheDir, 'litellm-model_prices_and_context_window.meta.json'),
      JSON.stringify({ fetchedAtMs: Date.now() }),
      'utf8'
    )

    const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('unexpected LiteLLM catalog fetch')
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.url
      if (url === 'https://example.com') {
        return htmlResponse('<!doctype html><html><body>Hi</body></html>')
      }
      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const stdout = collectStream()
    ;(stdout.stream as unknown as { isTTY?: boolean }).isTTY = false
    const stderr = collectStream()

    await runCli(
      [
        '--model',
        'openai/gpt-5.2',
        '--timeout',
        '2s',
        '--stream',
        'on',
        '--metrics',
        'off',
        'https://example.com',
      ],
      {
        env: { HOME: root, OPENAI_API_KEY: 'test' },
        fetch: fetchMock as unknown as typeof fetch,
        stdout: stdout.stream,
        stderr: stderr.stream,
      }
    )

    const call = streamTextMock.mock.calls[0]?.[0] as unknown as { prompt?: unknown }
    const promptText = String(call?.prompt ?? '')
    expect(promptText).toContain('<instructions>')
    expect(promptText).toContain('Explain for a kid.')
    expect(promptText).not.toContain('You summarize online articles')

    globalFetchSpy.mockRestore()
  })
})
