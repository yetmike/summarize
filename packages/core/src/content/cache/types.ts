import type { TranscriptSource } from '../link-preview/types.js'

export interface TranscriptCacheGetResult {
  content: string | null
  source: TranscriptSource | null
  expired: boolean
  metadata?: Record<string, unknown> | null
}

export interface TranscriptCacheSetArgs {
  url: string
  service: string
  resourceKey: string | null
  content: string | null
  source: TranscriptSource | null
  ttlMs: number
  metadata?: Record<string, unknown> | null
}

export interface TranscriptCache {
  get(args: { url: string }): Promise<TranscriptCacheGetResult | null>
  set(args: TranscriptCacheSetArgs): Promise<void>
}
