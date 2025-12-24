import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

import { runCli } from '../src/run.js'

const generateTextMock = vi.fn(async () => ({
  text: 'OK',
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
}))

vi.mock('ai', () => ({
  generateText: generateTextMock,
  streamText: () => {
    throw new Error('unexpected streamText call')
  },
}))

const createOpenAIMock = vi.fn(() => {
  const responsesModel = (_modelId: string) => ({ kind: 'responses' })
  const chatModel = (_modelId: string) => ({ kind: 'chat' })
  return Object.assign(responsesModel, { chat: chatModel })
})

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAIMock,
}))

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

describe('metrics model label', () => {
  it('keeps openrouter/… prefix in the finish line', async () => {
    const root = mkdtempSync(join(tmpdir(), 'summarize-openrouter-label-'))
    const cacheDir = join(root, '.summarize', 'cache')
    mkdirSync(cacheDir, { recursive: true })

    writeFileSync(
      join(cacheDir, 'litellm-model_prices_and_context_window.json'),
      JSON.stringify({
        'openai/xiaomi/mimo-v2-flash:free': { input_cost_per_token: 0, output_cost_per_token: 0 },
      }),
      'utf8'
    )
    writeFileSync(
      join(cacheDir, 'litellm-model_prices_and_context_window.meta.json'),
      JSON.stringify({ fetchedAtMs: Date.now() }),
      'utf8'
    )

    const html =
      '<!doctype html><html><head><title>Hello</title></head>' +
      '<body><article><p>Hi</p></article></body></html>'

    const fetchMock = vi.fn(async () => {
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } })
    })

    const stdout = collectStream()
    const stderr = collectStream()

    await runCli(
      [
        '--model',
        'openrouter/xiaomi/mimo-v2-flash:free',
        '--metrics',
        'on',
        '--stream',
        'off',
        '--timeout',
        '2s',
        'https://example.com',
      ],
      {
        env: { HOME: root, OPENROUTER_API_KEY: 'test' },
        fetch: fetchMock as unknown as typeof fetch,
        stdout: stdout.stream,
        stderr: stderr.stream,
      }
    )

    expect(stderr.getText()).toContain('openrouter/xiaomi/mimo-v2-flash:free')
    expect(stderr.getText()).not.toContain('openai/xiaomi/mimo-v2-flash:free')
  })
})
