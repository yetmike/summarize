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

const generateTextMock = vi.fn(async () => ({ text: 'OK' }))
const createOpenAIMock = vi.fn(({ apiKey }: { apiKey: string }) => {
  return (modelId: string) => ({ provider: 'openai', modelId, apiKey })
})
const createGoogleMock = vi.fn(({ apiKey }: { apiKey: string }) => {
  return (modelId: string) => ({ provider: 'google', modelId, apiKey })
})

vi.mock('ai', () => ({
  generateText: generateTextMock,
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAIMock,
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: createGoogleMock,
}))

function noopStream(): Writable {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
  })
}

function collectStdout() {
  let text = ''
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString()
      callback()
    },
  })
  return { stdout, getText: () => text }
}

describe('cli auto fallback behavior', () => {
  it('skips models with missing keys (auto)', async () => {
    generateTextMock.mockReset().mockResolvedValue({ text: 'OK' })
    createOpenAIMock.mockClear()
    createGoogleMock.mockClear()

    const html =
      '<!doctype html><html><head><title>Hello</title></head>' +
      `<body><article><p>${'This is a sentence. '.repeat(800)}</p></article></body></html>`

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.url
      if (url === 'https://example.com') return htmlResponse(html)
      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const tempRoot = mkdtempSync(join(tmpdir(), 'summarize-auto-fallback-'))
    mkdirSync(join(tempRoot, '.summarize'), { recursive: true })
    writeFileSync(
      join(tempRoot, '.summarize', 'config.json'),
      JSON.stringify({
        model: {
          mode: 'auto',
          rules: [
            {
              when: ['website'],
              candidates: ['google/gemini-3-flash-preview', 'openai/gpt-5-mini'],
            },
          ],
        },
      }),
      'utf8'
    )

    const out = collectStdout()
    await runCli(
      [
        '--model',
        'auto',
        '--timeout',
        '2s',
        '--max-output-tokens',
        '50',
        '--render',
        'plain',
        'https://example.com',
      ],
      {
        env: { HOME: tempRoot, OPENAI_API_KEY: 'test' },
        fetch: fetchMock as unknown as typeof fetch,
        stdout: out.stdout,
        stderr: noopStream(),
      }
    )

    expect(out.getText().trim()).toBe('OK')
    expect(createGoogleMock).toHaveBeenCalledTimes(0)
    expect(createOpenAIMock).toHaveBeenCalledTimes(1)
  })

  it('falls back on request errors (auto)', async () => {
    generateTextMock
      .mockReset()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ text: 'OK' })
    createOpenAIMock.mockClear()

    const html =
      '<!doctype html><html><head><title>Hello</title></head>' +
      `<body><article><p>${'This is a sentence. '.repeat(800)}</p></article></body></html>`

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.url
      if (url === 'https://example.com') return htmlResponse(html)
      throw new Error(`Unexpected fetch call: ${url}`)
    })

    const tempRoot = mkdtempSync(join(tmpdir(), 'summarize-auto-fallback-'))
    mkdirSync(join(tempRoot, '.summarize'), { recursive: true })
    writeFileSync(
      join(tempRoot, '.summarize', 'config.json'),
      JSON.stringify({
        model: {
          mode: 'auto',
          rules: [
            {
              when: ['website'],
              candidates: ['openai/gpt-5-nano', 'openai/gpt-5-mini'],
            },
          ],
        },
      }),
      'utf8'
    )

    const out = collectStdout()
    await runCli(
      [
        '--model',
        'auto',
        '--timeout',
        '2s',
        '--max-output-tokens',
        '50',
        '--render',
        'plain',
        'https://example.com',
      ],
      {
        env: { HOME: tempRoot, OPENAI_API_KEY: 'test' },
        fetch: fetchMock as unknown as typeof fetch,
        stdout: out.stdout,
        stderr: noopStream(),
      }
    )

    expect(out.getText().trim()).toBe('OK')
    expect(createOpenAIMock).toHaveBeenCalledTimes(2)
  })
})
