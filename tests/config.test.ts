import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { loadSummarizeConfig } from '../src/config.js'

describe('config loading', () => {
  it('loads ~/.summarize/config.json by default', () => {
    const root = mkdtempSync(join(tmpdir(), 'summarize-config-'))
    const configDir = join(root, '.summarize')
    mkdirSync(configDir, { recursive: true })
    const configPath = join(configDir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ model: { id: 'openai/gpt-5.2' } }), 'utf8')

    const result = loadSummarizeConfig({ env: { HOME: root } })
    expect(result.path).toBe(configPath)
    expect(result.config).toEqual({ model: { id: 'openai/gpt-5.2' } })
  })

  it('loads auto model rules', () => {
    const root = mkdtempSync(join(tmpdir(), 'summarize-config-'))
    const configDir = join(root, '.summarize')
    mkdirSync(configDir, { recursive: true })
    const configPath = join(configDir, 'config.json')

    writeFileSync(
      configPath,
      JSON.stringify({
        model: {
          mode: 'auto',
          rules: [
            { when: ['video'], candidates: ['google/gemini-3-flash-preview'] },
            {
              when: ['youtube', 'website'],
              candidates: ['openai/gpt-5-nano', 'xai/grok-4-fast-non-reasoning'],
            },
            { candidates: ['openai/gpt-5-nano', 'openrouter/openai/gpt-5-nano'] },
          ],
        },
        media: { videoMode: 'auto' },
      }),
      'utf8'
    )

    const result = loadSummarizeConfig({ env: { HOME: root } })
    expect(result.path).toBe(configPath)
    expect(result.config).toEqual({
      model: {
        mode: 'auto',
        rules: [
          { when: ['video'], candidates: ['google/gemini-3-flash-preview'] },
          {
            when: ['youtube', 'website'],
            candidates: ['openai/gpt-5-nano', 'xai/grok-4-fast-non-reasoning'],
          },
          { candidates: ['openai/gpt-5-nano', 'openrouter/openai/gpt-5-nano'] },
        ],
      },
      media: { videoMode: 'auto' },
    })
  })

  it('supports model shorthand strings ("auto", "free", provider/model)', () => {
    const root = mkdtempSync(join(tmpdir(), 'summarize-config-'))
    const configDir = join(root, '.summarize')
    mkdirSync(configDir, { recursive: true })
    const configPath = join(configDir, 'config.json')

    writeFileSync(configPath, JSON.stringify({ model: 'auto' }), 'utf8')
    expect(loadSummarizeConfig({ env: { HOME: root } }).config).toEqual({ model: { mode: 'auto' } })

    writeFileSync(configPath, JSON.stringify({ model: 'free' }), 'utf8')
    expect(loadSummarizeConfig({ env: { HOME: root } }).config).toEqual({ model: { mode: 'free' } })

    writeFileSync(configPath, JSON.stringify({ model: 'openai/gpt-5-mini' }), 'utf8')
    expect(loadSummarizeConfig({ env: { HOME: root } }).config).toEqual({
      model: { id: 'openai/gpt-5-mini' },
    })
  })
})
