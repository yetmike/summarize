import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

import type { ExecFileFn } from '../src/markitdown.js'
import { runCli } from '../src/run.js'

function noopStream() {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
  })
}

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
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

const streamTextMock = vi.fn(() => ({
  textStream: createTextStream(['OK\n']),
  totalUsage: Promise.resolve({ promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
}))

const createXaiMock = vi.fn(() => {
  return (_modelId: string) => ({})
})

const createGoogleMock = vi.fn(() => {
  return (_modelId: string) => ({})
})

const createOpenAiMock = vi.fn(() => {
  const fn = (_modelId: string) => ({})
  ;(fn as unknown as { chat?: (modelId: string) => unknown }).chat = (_modelId: string) => ({})
  return fn
})

vi.mock('ai', () => ({
  streamText: streamTextMock,
}))

vi.mock('@ai-sdk/xai', () => ({
  createXai: createXaiMock,
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: createGoogleMock,
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAiMock,
}))

describe('cli preprocess / markitdown integration', () => {
  it('does not invoke markitdown for file preprocessing unless --format md', async () => {
    streamTextMock.mockClear()

    const root = mkdtempSync(join(tmpdir(), 'summarize-preprocess-off-by-format-'))
    const pdfPath = join(root, 'test.pdf')
    writeFileSync(pdfPath, Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n', 'utf8'))

    const execFileMock = vi.fn(() => {
      throw new Error('unexpected execFile')
    })

    const run = () =>
      runCli(
        ['--model', 'xai/grok-4-fast-non-reasoning', '--timeout', '2s', '--stream', 'on', pdfPath],
        {
          env: { XAI_API_KEY: 'test', UVX_PATH: 'uvx' },
          fetch: vi.fn(async () => {
            throw new Error('unexpected fetch')
          }) as unknown as typeof fetch,
          execFile: execFileMock as unknown as ExecFileFn,
          stdout: noopStream(),
          stderr: noopStream(),
        }
      )

    await expect(run()).rejects.toThrow(/does not support attaching files/i)
    expect(streamTextMock).toHaveBeenCalledTimes(0)
    expect(execFileMock).toHaveBeenCalledTimes(0)
  })

  it('preprocesses and retries with Markdown when a provider rejects PDF attachments (auto)', async () => {
    streamTextMock.mockClear()

    const root = mkdtempSync(join(tmpdir(), 'summarize-preprocess-auto-retry-'))
    const pdfPath = join(root, 'test.pdf')
    writeFileSync(pdfPath, Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n', 'utf8'))

    const execFileMock = vi.fn((file, args, _opts, cb) => {
      expect(file).toBe('uvx')
      expect(args.slice(0, 3)).toEqual(['--from', 'markitdown[all]', 'markitdown'])
      cb(null, '# Converted\n\nHello\n', '')
    })

    const stdout = collectStream()

    await runCli(
      [
        '--model',
        'xai/grok-4-fast-non-reasoning',
        '--format',
        'md',
        '--timeout',
        '2s',
        '--stream',
        'on',
        pdfPath,
      ],
      {
        env: { XAI_API_KEY: 'test', UVX_PATH: 'uvx' },
        fetch: vi.fn(async () => {
          throw new Error('unexpected fetch')
        }) as unknown as typeof fetch,
        execFile: execFileMock as unknown as ExecFileFn,
        stdout: stdout.stream,
        stderr: noopStream(),
      }
    )

    expect(execFileMock).toHaveBeenCalledTimes(1)
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    const callArgs = streamTextMock.mock.calls[0]?.[0] as { prompt?: unknown; messages?: unknown }
    expect(typeof callArgs.prompt).toBe('string')
    expect(callArgs.messages).toBeUndefined()
    expect(String(callArgs.prompt)).toContain('# Converted')
    expect(stdout.getText()).toContain('OK')
  })

  it('preprocesses first when --preprocess always is used (even if attachments are supported)', async () => {
    streamTextMock.mockClear()

    const root = mkdtempSync(join(tmpdir(), 'summarize-preprocess-always-'))
    const pdfPath = join(root, 'test.pdf')
    writeFileSync(pdfPath, Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n', 'utf8'))

    const execFileMock = vi.fn((file, args, _opts, cb) => {
      expect(file).toBe('uvx')
      expect(args.slice(0, 3)).toEqual(['--from', 'markitdown[all]', 'markitdown'])
      cb(null, '# Converted\n\nAlways\n', '')
    })

    const stdout = collectStream()

    await runCli(
      [
        '--model',
        'openai/gpt-4o-mini',
        '--format',
        'md',
        '--preprocess',
        'always',
        '--timeout',
        '2s',
        '--stream',
        'on',
        pdfPath,
      ],
      {
        env: { OPENAI_API_KEY: 'test', UVX_PATH: 'uvx' },
        fetch: vi.fn(async () => {
          throw new Error('unexpected fetch')
        }) as unknown as typeof fetch,
        execFile: execFileMock as unknown as ExecFileFn,
        stdout: stdout.stream,
        stderr: noopStream(),
      }
    )

    expect(execFileMock).toHaveBeenCalledTimes(1)
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    const callArgs = streamTextMock.mock.calls[0]?.[0] as { prompt?: unknown; messages?: unknown }
    expect(typeof callArgs.prompt).toBe('string')
    expect(String(callArgs.prompt)).toContain('# Converted')
    expect(stdout.getText()).toContain('OK')
  })
})
