import { load } from 'cheerio'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const isYouTubeUrl = (rawUrl: string): boolean => {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase()
    return hostname.includes('youtube.com') || hostname.includes('youtu.be')
  } catch {
    const lower = rawUrl.toLowerCase()
    return lower.includes('youtube.com') || lower.includes('youtu.be')
  }
}

export function extractYouTubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.hostname === 'youtu.be') {
      return url.pathname.slice(1) || null
    }
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/watch')) {
        return url.searchParams.get('v')
      }
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/')[2] ?? null
      }
    }
  } catch {
    // Ignore parsing errors for malformed URLs
  }
  return null
}

export function sanitizeYoutubeJsonResponse(input: string): string {
  const trimmed = input.trimStart()
  if (trimmed.startsWith(")]}'")) {
    return trimmed.slice(4)
  }
  return trimmed
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#x27;', "'")
    .replaceAll('&#x2F;', '/')
    .replaceAll('&nbsp;', ' ')
}

export function extractYoutubeBootstrapConfig(html: string): Record<string, unknown> | null {
  try {
    const $ = load(html)
    const scripts = $('script').toArray()

    for (const script of scripts) {
      const source = $(script).html()
      if (!source) {
        continue
      }

      const config = parseBootstrapFromScript(source)
      if (config) {
        return config
      }
    }
  } catch {
    // fall through to legacy regex
  }

  return parseBootstrapFromScript(html)
}

const YTCFG_SET_TOKEN = 'ytcfg.set'
const YTCFG_VAR_TOKEN = 'var ytcfg'

function extractBalancedJsonObject(source: string, startAt: number): string | null {
  const start = source.indexOf('{', startAt)
  if (start < 0) {
    return null
  }

  let depth = 0
  let inString = false
  let quote: '"' | "'" | null = null
  let escaping = false

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]
    if (!ch) {
      continue
    }

    if (inString) {
      if (escaping) {
        escaping = false
        continue
      }
      if (ch === '\\') {
        escaping = true
        continue
      }
      if (quote && ch === quote) {
        inString = false
        quote = null
      }
      continue
    }

    if (ch === '"' || ch === "'") {
      inString = true
      quote = ch
      continue
    }

    if (ch === '{') {
      depth += 1
      continue
    }
    if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(start, i + 1)
      }
    }
  }

  return null
}

function parseBootstrapFromScript(source: string): Record<string, unknown> | null {
  const sanitizedSource = sanitizeYoutubeJsonResponse(source.trimStart())

  for (let index = 0; index >= 0; ) {
    index = sanitizedSource.indexOf(YTCFG_SET_TOKEN, index)
    if (index < 0) {
      break
    }
    const object = extractBalancedJsonObject(sanitizedSource, index)
    if (object) {
      try {
        const parsed: unknown = JSON.parse(object)
        if (isRecord(parsed)) {
          return parsed
        }
      } catch {
        // keep searching
      }
    }
    index += YTCFG_SET_TOKEN.length
  }

  const varIndex = sanitizedSource.indexOf(YTCFG_VAR_TOKEN)
  if (varIndex >= 0) {
    const object = extractBalancedJsonObject(sanitizedSource, varIndex)
    if (object) {
      try {
        const parsed: unknown = JSON.parse(object)
        if (isRecord(parsed)) {
          return parsed
        }
      } catch {
        return null
      }
    }
  }

  return null
}
