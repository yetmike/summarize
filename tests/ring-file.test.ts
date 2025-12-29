import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createRingFileWriter } from '../src/logging/ring-file.js'

describe('ring file writer', () => {
  it('rotates when size exceeds max bytes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'summarize-ring-'))
    const filePath = join(dir, 'daemon.jsonl')
    const writer = createRingFileWriter({ filePath, maxBytes: 40, maxFiles: 2 })

    writer.write('first-line-1234567890')
    writer.write('second-line-1234567890')
    await writer.flush()

    const current = readFileSync(filePath, 'utf8')
    const rotated = readFileSync(`${filePath}.1`, 'utf8')

    expect(current).toContain('second-line-1234567890')
    expect(rotated).toContain('first-line-1234567890')
  })
})
