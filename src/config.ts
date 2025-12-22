import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import JSON5 from 'json5'

export type AutoRuleKind = 'text' | 'website' | 'youtube' | 'image' | 'video' | 'file'
export type VideoMode = 'auto' | 'transcript' | 'understand'

export type AutoRule = {
  /**
   * Input kinds this rule applies to.
   *
   * Omit for "catch-all".
   */
  when?: AutoRuleKind[]

  /**
   * Candidate model ids (ordered).
   *
   * - Native: `openai/...`, `google/...`, `xai/...`, `anthropic/...`
   * - OpenRouter (forced): `openrouter/<provider>/<model>` (e.g. `openrouter/openai/gpt-5-nano`)
   */
  candidates?: string[]

  /**
   * Token-based candidate selection (ordered).
   *
   * First matching band wins.
   */
  bands?: Array<{
    token?: { min?: number; max?: number }
    candidates: string[]
  }>
}

export type ModelConfig =
  | {
      id: string
    }
  | {
      mode: 'auto' | 'free'
      rules?: AutoRule[]
    }

export type SummarizeConfig = {
  model?: ModelConfig
  media?: {
    videoMode?: VideoMode
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseAutoRuleKind(value: unknown): AutoRuleKind | null {
  return value === 'text' ||
    value === 'website' ||
    value === 'youtube' ||
    value === 'image' ||
    value === 'video' ||
    value === 'file'
    ? (value as AutoRuleKind)
    : null
}

function parseWhenKinds(raw: unknown, path: string): AutoRuleKind[] {
  if (!Array.isArray(raw)) {
    throw new Error(`Invalid config file ${path}: "model.rules[].when" must be an array of kinds.`)
  }

  if (raw.length === 0) {
    throw new Error(`Invalid config file ${path}: "model.rules[].when" must not be empty.`)
  }

  const kinds: AutoRuleKind[] = []
  for (const entry of raw) {
    const kind = parseAutoRuleKind(entry)
    if (!kind) {
      throw new Error(`Invalid config file ${path}: unknown "when" kind "${String(entry)}".`)
    }
    if (!kinds.includes(kind)) kinds.push(kind)
  }

  return kinds
}

function parseModelCandidates(raw: unknown, path: string): string[] {
  if (!Array.isArray(raw)) {
    throw new Error(
      `Invalid config file ${path}: "model.rules[].candidates" must be an array of strings.`
    )
  }
  const candidates: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      throw new Error(
        `Invalid config file ${path}: "model.rules[].candidates" must be an array of strings.`
      )
    }
    const trimmed = entry.trim()
    if (trimmed.length === 0) continue
    candidates.push(trimmed)
  }
  if (candidates.length === 0) {
    throw new Error(`Invalid config file ${path}: "model.rules[].candidates" must not be empty.`)
  }
  return candidates
}

function parseTokenBand(
  raw: unknown,
  path: string
): { token?: { min?: number; max?: number }; candidates: string[] } {
  if (!isRecord(raw)) {
    throw new Error(`Invalid config file ${path}: "model.rules[].bands[]" must be an object.`)
  }

  const candidates = parseModelCandidates(raw.candidates, path)

  const token = (() => {
    if (typeof raw.token === 'undefined') return undefined
    if (!isRecord(raw.token)) {
      throw new Error(
        `Invalid config file ${path}: "model.rules[].bands[].token" must be an object.`
      )
    }
    const min = typeof raw.token.min === 'number' ? raw.token.min : undefined
    const max = typeof raw.token.max === 'number' ? raw.token.max : undefined

    if (typeof min === 'number' && (!Number.isFinite(min) || min < 0)) {
      throw new Error(
        `Invalid config file ${path}: "model.rules[].bands[].token.min" must be >= 0.`
      )
    }
    if (typeof max === 'number' && (!Number.isFinite(max) || max < 0)) {
      throw new Error(
        `Invalid config file ${path}: "model.rules[].bands[].token.max" must be >= 0.`
      )
    }
    if (typeof min === 'number' && typeof max === 'number' && min > max) {
      throw new Error(
        `Invalid config file ${path}: "model.rules[].bands[].token.min" must be <= "token.max".`
      )
    }

    return typeof min === 'number' || typeof max === 'number' ? { min, max } : undefined
  })()

  return { ...(token ? { token } : {}), candidates }
}

function assertNoComments(raw: string, path: string): void {
  let inString: '"' | "'" | null = null
  let escaped = false
  let line = 1
  let col = 1

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i] ?? ''
    const next = raw[i + 1] ?? ''

    if (inString) {
      if (escaped) {
        escaped = false
        col += 1
        continue
      }
      if (ch === '\\') {
        escaped = true
        col += 1
        continue
      }
      if (ch === inString) {
        inString = null
      }
      if (ch === '\n') {
        line += 1
        col = 1
      } else {
        col += 1
      }
      continue
    }

    if (ch === '"' || ch === "'") {
      inString = ch as '"' | "'"
      escaped = false
      col += 1
      continue
    }

    if (ch === '/' && next === '/') {
      throw new Error(
        `Invalid config file ${path}: comments are not allowed (found // at ${line}:${col}).`
      )
    }

    if (ch === '/' && next === '*') {
      throw new Error(
        `Invalid config file ${path}: comments are not allowed (found /* at ${line}:${col}).`
      )
    }

    if (ch === '\n') {
      line += 1
      col = 1
    } else {
      col += 1
    }
  }
}

export function loadSummarizeConfig({ env }: { env: Record<string, string | undefined> }): {
  config: SummarizeConfig | null
  path: string | null
} {
  const home = env.HOME?.trim() || homedir()
  if (!home) return { config: null, path: null }
  const path = join(home, '.summarize', 'config.json')

  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return { config: null, path }
  }

  let parsed: unknown
  assertNoComments(raw, path)
  try {
    parsed = JSON5.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid JSON in config file ${path}: ${message}`)
  }

  if (!isRecord(parsed)) {
    throw new Error(`Invalid config file ${path}: expected an object at the top level`)
  }

  if (typeof parsed.auto !== 'undefined') {
    throw new Error(
      `Invalid config file ${path}: legacy top-level "auto" is not supported (use "model": { "mode": "auto", "rules": [...] }).`
    )
  }

  const model = (() => {
    const raw = parsed.model
    if (typeof raw === 'undefined') return undefined

    // Shorthand:
    // - "auto" -> { mode: "auto" }
    // - "free" -> { mode: "free" }
    // - "<provider>/<model>" or "openrouter/<provider>/<model>" -> { id: "..." }
    if (typeof raw === 'string') {
      const value = raw.trim()
      if (value.length === 0) {
        throw new Error(`Invalid config file ${path}: "model" must not be empty.`)
      }
      if (value.toLowerCase() === 'auto') {
        return { mode: 'auto' } satisfies ModelConfig
      }
      if (value.toLowerCase() === 'free') {
        return { mode: 'free' } satisfies ModelConfig
      }
      return { id: value } satisfies ModelConfig
    }

    if (!isRecord(raw)) {
      throw new Error(`Invalid config file ${path}: "model" must be an object.`)
    }

    if (typeof raw.id === 'string') {
      const id = raw.id.trim()
      if (id.length === 0) {
        throw new Error(`Invalid config file ${path}: "model.id" must not be empty.`)
      }
      return { id } satisfies ModelConfig
    }

    if (raw.mode === 'auto' || raw.mode === 'free') {
      const mode = raw.mode
      const rules = (() => {
        if (typeof raw.rules === 'undefined') return undefined
        if (!Array.isArray(raw.rules)) {
          throw new Error(`Invalid config file ${path}: "model.rules" must be an array.`)
        }
        const rulesParsed: AutoRule[] = []
        for (const entry of raw.rules) {
          if (!isRecord(entry)) continue
          const when =
            typeof entry.when === 'undefined' ? undefined : parseWhenKinds(entry.when, path)

          const hasCandidates = typeof entry.candidates !== 'undefined'
          const hasBands = typeof entry.bands !== 'undefined'
          if (hasCandidates && hasBands) {
            throw new Error(
              `Invalid config file ${path}: "model.rules[]" must use either "candidates" or "bands" (not both).`
            )
          }

          if (hasCandidates) {
            const candidates = parseModelCandidates(entry.candidates, path)
            rulesParsed.push({ ...(when ? { when } : {}), candidates })
            continue
          }

          if (hasBands) {
            if (!Array.isArray(entry.bands) || entry.bands.length === 0) {
              throw new Error(
                `Invalid config file ${path}: "model.rules[].bands" must be a non-empty array.`
              )
            }
            const bands = entry.bands.map((b) => parseTokenBand(b, path))
            rulesParsed.push({ ...(when ? { when } : {}), bands })
            continue
          }

          throw new Error(
            `Invalid config file ${path}: "model.rules[]" must include "candidates" or "bands".`
          )
        }
        return rulesParsed
      })()
      return { mode, ...(rules ? { rules } : {}) } satisfies ModelConfig
    }

    throw new Error(
      `Invalid config file ${path}: "model" must include either "id" or { "mode": "auto"|"free" }.`
    )
  })()

  const media = (() => {
    const value = parsed.media
    if (!isRecord(value)) return undefined
    const videoMode =
      value.videoMode === 'auto' ||
      value.videoMode === 'transcript' ||
      value.videoMode === 'understand'
        ? (value.videoMode as VideoMode)
        : undefined
    return videoMode ? { videoMode } : undefined
  })()

  return { config: { ...(model ? { model } : {}), ...(media ? { media } : {}) }, path }
}
