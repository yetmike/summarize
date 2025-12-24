import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

import { runCli } from '../src/run.js'

const generateTextMock = vi.fn(async () => ({
  text: 'See [Heise](https://www.heise.de/) for details.',
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
}))

vi.mock('ai', () => ({
  generateText: generateTextMock,
  streamText: () => {
    throw new Error('unexpected streamText call')
  },
}))

const createOpenAIMock = vi.fn(() => {
  return (_modelId: string) => ({})
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

describe('cli markdown hyperlinks', () => {
  it('uses OSC-8 hyperlinks for markdown links on a TTY', async () => {
    const root = mkdtempSync(join(tmpdir(), 'summarize-hyperlinks-'))
    const cacheDir = join(root, '.summarize', 'cache')
    mkdirSync(cacheDir, { recursive: true })

    writeFileSync(
      join(cacheDir, 'litellm-model_prices_and_context_window.json'),
      JSON.stringify({
        'gpt-5.2': { input_cost_per_token: 0.00000175, output_cost_per_token: 0.000014 },
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
    ;(stdout.stream as unknown as { isTTY?: boolean; columns?: number }).isTTY = true
    ;(stdout.stream as unknown as { columns?: number }).columns = 80
    const stderr = collectStream()

    await runCli(
      ['--model', 'openai/gpt-5.2', '--render', 'md', '--stream', 'off', 'https://example.com'],
      {
      env: { HOME: root, OPENAI_API_KEY: 'test', TERM: 'xterm-256color' },
      fetch: fetchMock as unknown as typeof fetch,
      stdout: stdout.stream,
      stderr: stderr.stream,
      }
    )

    const out = stdout.getText()
    expect(out).toContain('\u001b]8;;https://www.heise.de/\u0007')
    expect(out).toContain('\u001b]8;;\u0007')
  })
})
