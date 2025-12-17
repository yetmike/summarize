import type { FirecrawlScrapeResult, LinkPreviewDeps } from '../deps.js'
import { resolveTranscriptForLink } from '../transcript/index.js'
import type { CacheMode, FirecrawlDiagnostics } from '../types.js'

import { extractArticleContent } from './article.js'
import { normalizeForPrompt } from './cleaner.js'
import { fetchHtmlDocument, fetchWithFirecrawl } from './fetcher.js'
import { extractMetadataFromFirecrawl, extractMetadataFromHtml } from './parsers.js'
import type { ExtractedLinkContent, FetchLinkContentOptions } from './types.js'
import {
  appendNote,
  ensureTranscriptDiagnostics,
  finalizeExtractedLinkContent,
  pickFirstText,
  resolveCacheMode,
  resolveMaxCharacters,
  safeHostname,
  selectBaseContent,
} from './utils.js'
import { extractYouTubeShortDescription } from './youtube.js'

const LEADING_CONTROL_PATTERN = /^[\\s\\p{Cc}]+/u

function stripLeadingTitle(content: string, title: string | null | undefined): string {
  if (!(content && title)) {
    return content
  }

  const normalizedTitle = title.trim()
  if (normalizedTitle.length === 0) {
    return content
  }

  const trimmedContent = content.trimStart()
  if (!trimmedContent.toLowerCase().startsWith(normalizedTitle.toLowerCase())) {
    return content
  }

  const remainderOriginal = trimmedContent.slice(normalizedTitle.length)
  const remainder = remainderOriginal.replace(LEADING_CONTROL_PATTERN, '')
  return remainder
}

export async function fetchLinkContent(
  url: string,
  options: FetchLinkContentOptions | undefined,
  deps: LinkPreviewDeps
): Promise<ExtractedLinkContent> {
  const maxCharacters = resolveMaxCharacters(options)
  const cacheMode = resolveCacheMode(options)

  const firecrawlAttempt = await fetchWithFirecrawl(url, cacheMode, deps.scrapeWithFirecrawl)

  if (firecrawlAttempt.payload) {
    const firecrawlResult = await buildResultFromFirecrawl({
      url,
      payload: firecrawlAttempt.payload,
      maxCharacters,
      cacheMode,
      firecrawlDiagnostics: firecrawlAttempt.diagnostics,
      deps,
    })
    if (firecrawlResult) {
      return firecrawlResult
    }
    firecrawlAttempt.diagnostics.notes = appendNote(
      firecrawlAttempt.diagnostics.notes,
      'Firecrawl returned empty content'
    )
  }

  if (firecrawlAttempt.diagnostics.cacheStatus === 'unknown') {
    firecrawlAttempt.diagnostics.cacheStatus = cacheMode === 'bypass' ? 'bypassed' : 'miss'
  }

  const html = await fetchHtmlDocument(deps.fetch, url)
  return buildResultFromHtmlDocument({
    url,
    html,
    maxCharacters,
    cacheMode,
    firecrawlDiagnostics: firecrawlAttempt.diagnostics,
    deps,
  })
}

async function buildResultFromFirecrawl({
  url,
  payload,
  maxCharacters,
  cacheMode,
  firecrawlDiagnostics,
  deps,
}: {
  url: string
  payload: FirecrawlScrapeResult
  maxCharacters: number
  cacheMode: CacheMode
  firecrawlDiagnostics: FirecrawlDiagnostics
  deps: LinkPreviewDeps
}): Promise<ExtractedLinkContent | null> {
  const normalizedMarkdown = normalizeForPrompt(payload.markdown ?? '')
  if (normalizedMarkdown.length === 0) {
    firecrawlDiagnostics.notes = appendNote(
      firecrawlDiagnostics.notes,
      'Firecrawl markdown normalization yielded empty text'
    )
    return null
  }

  const transcriptResolution = await resolveTranscriptForLink(url, payload.html ?? null, deps, {
    cacheMode,
  })
  const baseContent = selectBaseContent(normalizedMarkdown, transcriptResolution.text)
  if (baseContent.length === 0) {
    firecrawlDiagnostics.notes = appendNote(
      firecrawlDiagnostics.notes,
      'Firecrawl produced content that normalized to an empty string'
    )
    return null
  }

  const htmlMetadata = payload.html
    ? extractMetadataFromHtml(payload.html, url)
    : { title: null, description: null, siteName: null }
  const metadata = extractMetadataFromFirecrawl(payload.metadata ?? null)

  const title = pickFirstText([metadata.title, htmlMetadata.title])
  const description = pickFirstText([metadata.description, htmlMetadata.description])
  const siteName = pickFirstText([metadata.siteName, htmlMetadata.siteName, safeHostname(url)])

  firecrawlDiagnostics.used = true
  if (firecrawlDiagnostics.cacheStatus === 'unknown') {
    firecrawlDiagnostics.cacheStatus = cacheMode === 'bypass' ? 'bypassed' : 'miss'
  }

  const transcriptDiagnostics = ensureTranscriptDiagnostics(transcriptResolution, cacheMode)

  return finalizeExtractedLinkContent({
    url,
    baseContent,
    maxCharacters,
    title,
    description,
    siteName,
    transcriptResolution,
    diagnostics: {
      strategy: 'firecrawl',
      firecrawl: firecrawlDiagnostics,
      transcript: transcriptDiagnostics,
    },
  })
}

async function buildResultFromHtmlDocument({
  url,
  html,
  maxCharacters,
  cacheMode,
  firecrawlDiagnostics,
  deps,
}: {
  url: string
  html: string
  maxCharacters: number
  cacheMode: CacheMode
  firecrawlDiagnostics: FirecrawlDiagnostics
  deps: LinkPreviewDeps
}): Promise<ExtractedLinkContent> {
  const { title, description, siteName } = extractMetadataFromHtml(html, url)
  const rawContent = extractArticleContent(html)
  const normalized = normalizeForPrompt(rawContent)
  const transcriptResolution = await resolveTranscriptForLink(url, html, deps, { cacheMode })

  const youtubeDescription =
    transcriptResolution.text === null ? extractYouTubeShortDescription(html) : null
  const baseCandidate = youtubeDescription ? normalizeForPrompt(youtubeDescription) : normalized

  let baseContent = selectBaseContent(baseCandidate, transcriptResolution.text)
  if (baseContent === normalized) {
    baseContent = stripLeadingTitle(baseContent, title)
  }

  const transcriptDiagnostics = ensureTranscriptDiagnostics(transcriptResolution, cacheMode)

  return finalizeExtractedLinkContent({
    url,
    baseContent,
    maxCharacters,
    title,
    description,
    siteName,
    transcriptResolution,
    diagnostics: {
      strategy: 'html',
      firecrawl: firecrawlDiagnostics,
      transcript: transcriptDiagnostics,
    },
  })
}

export {
  DEFAULT_MAX_CONTENT_CHARACTERS,
  type ExtractedLinkContent,
  type FetchLinkContentOptions,
} from './types.js'
