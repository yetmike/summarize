import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import type { ExecFileFn } from '../src/markitdown.js'
import { runCli } from '../src/run.js'

describe('--model cli/... progress', () => {
  it('runs a fixed CLI model with TTY progress enabled', async () => {
    const binDir = await fs.mkdtemp(path.join(tmpdir(), 'summarize-bin-'))
    await fs.writeFile(path.join(binDir, 'gemini'), '#!/bin/sh\necho ok\n', 'utf8')
    await fs.chmod(path.join(binDir, 'gemini'), 0o755)

    const html = `<!doctype html><html><head><title>Ok</title></head><body><article><p>${'A'.repeat(
      2000
    )}</p></article></body></html>`
    const fetchMock = async () => new Response(html, { status: 200 })

    const execFileImpl: ExecFileFn = ((_cmd, _args, _options, cb) => {
      cb?.(null, JSON.stringify({ response: 'ok' }), '')
      return {
        stdin: { write: () => {}, end: () => {} },
      } as unknown as ReturnType<ExecFileFn>
    }) as ExecFileFn

    let stdoutText = ''
    const stdout = new Writable({
      write(chunk, _encoding, callback) {
        stdoutText += chunk.toString()
        callback()
      },
    })

    const stderr = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
    }) as Writable & { isTTY?: boolean; columns?: number }
    stderr.isTTY = true
    stderr.columns = 120

    await runCli(
      ['--model', 'cli/gemini/gemini-3-flash-preview', '--timeout', '2s', 'https://example.com'],
      {
        env: { PATH: binDir, TERM: 'xterm-256color' },
        fetch: fetchMock as unknown as typeof fetch,
        execFile: execFileImpl,
        stdout,
        stderr,
      }
    )

    expect(stdoutText).toContain('ok')
  })
})
