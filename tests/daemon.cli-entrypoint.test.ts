import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveCliEntrypointCandidatesFromWindowsShim } from '../src/daemon/cli-entrypoint.js'

describe('resolveCliEntrypointCandidatesFromWindowsShim', () => {
  it('parses shim paths outside the bin dir', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'summarize-shim-'))
    const binDir = path.join(tmpDir, 'bin')
    await fs.mkdir(binDir, { recursive: true })
    const shimPath = path.join(binDir, 'summarize.ps1')
    const expected = path.resolve(
      binDir,
      '..',
      'lib',
      'node_modules',
      '@steipete',
      'summarize',
      'dist',
      'cli.js'
    )

    const contents = '& "$basedir/../lib/node_modules/@steipete/summarize/dist/cli.js" @args\n'
    await fs.writeFile(shimPath, contents, 'utf8')

    const candidates = await resolveCliEntrypointCandidatesFromWindowsShim(shimPath)

    expect(candidates).toContain(expected)
    await fs.rm(tmpDir, { recursive: true, force: true })
  })
})
