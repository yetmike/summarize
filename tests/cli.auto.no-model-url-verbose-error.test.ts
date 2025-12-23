import { Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

import { runCli } from '../src/run.js'

vi.mock('../src/llm/generate-text.js', () => ({
  generateTextWithModelId: vi.fn(async () => {
    throw new Error('boom')
  }),
  streamTextWithModelId: vi.fn(async () => {
    throw new Error('boom')
  }),
}))

describe('--model auto no-model-url-verbose-error', () => {
  it('prints extracted content and a verbose "auto failed all models" line', async () => {
    const html = `<!doctype html><html><head><title>Ok</title></head><body><article><p>${'A'.repeat(
      2000
    )}</p></article></body></html>`

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('generativelanguage.googleapis.com')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'models/gemini-3-flash-preview' }] }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
      return new Response(html, { status: 200 })
    })

    let stdoutText = ''
    const stdout = new Writable({
      write(chunk, _encoding, callback) {
        stdoutText += chunk.toString()
        callback()
      },
    })

    let stderrText = ''
    const stderr = new Writable({
      write(chunk, _encoding, callback) {
        stderrText += chunk.toString()
        callback()
      },
    })

    await runCli(
      ['--verbose', '--max-output-tokens', '50', '--timeout', '2s', 'https://example.com'],
      {
        env: { GEMINI_API_KEY: 'x' },
        fetch: fetchMock as unknown as typeof fetch,
        stdout,
        stderr,
      }
    )

    expect(stdoutText).toContain('A'.repeat(50))
    expect(stderrText).toMatch(/auto failed all models:/i)
  })
})
