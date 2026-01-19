import type { OutputLanguage } from '../language.js'
import { formatOutputLanguageInstruction } from '../language.js'
import { buildInstructions, buildTaggedPrompt, type PromptOverrides } from './format.js'
import { pickSummaryLengthForCharacters, type SummaryLengthTarget } from './link-summary.js'
import { formatPresetLengthGuidance, resolveSummaryLengthSpec } from './summary-lengths.js'

export function buildFileSummaryPrompt({
  filename,
  mediaType,
  outputLanguage,
  summaryLength,
  contentLength,
  promptOverride,
  lengthInstruction,
  languageInstruction,
}: {
  filename: string | null
  mediaType: string | null
  summaryLength: SummaryLengthTarget
  contentLength?: number | null
  outputLanguage?: OutputLanguage | null
  promptOverride?: string | null
  lengthInstruction?: string | null
  languageInstruction?: string | null
}): string {
  const shouldIgnoreSponsors = Boolean(
    mediaType?.startsWith('audio/') || mediaType?.startsWith('video/')
  )
  const contentCharacters = typeof contentLength === 'number' ? contentLength : null
  const effectiveSummaryLength =
    typeof summaryLength === 'string'
      ? summaryLength
      : contentCharacters &&
          contentCharacters > 0 &&
          summaryLength.maxCharacters > contentCharacters
        ? { maxCharacters: contentCharacters }
        : summaryLength
  const preset =
    typeof effectiveSummaryLength === 'string'
      ? effectiveSummaryLength
      : pickSummaryLengthForCharacters(effectiveSummaryLength.maxCharacters)
  const directive = resolveSummaryLengthSpec(preset)
  const presetLengthLine =
    typeof effectiveSummaryLength === 'string' ? formatPresetLengthGuidance(preset) : ''
  const maxCharactersLine =
    typeof effectiveSummaryLength === 'string'
      ? ''
      : `Target length: up to ${effectiveSummaryLength.maxCharacters.toLocaleString()} characters total (including Markdown and whitespace). Hard limit: do not exceed it.`
  const contentLengthLine =
    contentCharacters && contentCharacters > 0
      ? `Extracted content length: ${contentCharacters.toLocaleString()} characters. Hard limit: never exceed this length. If the requested length is larger, do not pad—finish early rather than adding filler.`
      : ''

  const headerLines = [
    filename ? `Filename: ${filename}` : null,
    mediaType ? `Media type: ${mediaType}` : null,
  ].filter(Boolean)

  const baseInstructions = [
    'Hard rules: never mention sponsor/ads; never output quotation marks of any kind (straight or curly), even for titles.',
    'Never include quotation marks in the output. Apostrophes in contractions are OK. If a title or excerpt would normally use quotes, remove them and optionally italicize the text instead.',
    'You summarize files for curious users.',
    'Summarize the attached file.',
    'Be factual and do not invent details.',
    shouldIgnoreSponsors
      ? 'Omit sponsor messages, ads, promos, and calls-to-action (including podcast ad reads), even if they appear in the transcript. Do not mention or acknowledge them, and do not say you skipped or ignored anything. Avoid sponsor/ad/promo language, brand names like Squarespace, or CTA phrases like discount code.'
      : '',
    directive.guidance,
    directive.formatting,
    'Format the answer in Markdown.',
    'Use short paragraphs; use bullet lists only when they improve scanability; avoid rigid templates.',
    'If a standout line is present, include 1-2 short exact excerpts (max 25 words each) formatted as Markdown italics using single asterisks only. Do not use quotation marks of any kind (straight or curly). Remove any quotation marks from excerpts. If you cannot format an italic excerpt, omit it. Never include ad/sponsor/boilerplate excerpts and do not mention them.',
    'Do not use emojis.',
    presetLengthLine,
    maxCharactersLine,
    contentLengthLine,
    formatOutputLanguageInstruction(outputLanguage ?? { kind: 'auto' }),
    'Final check: remove any sponsor/ad references or mentions of skipping/ignoring content. Remove any quotation marks. Ensure standout excerpts are italicized; otherwise omit them.',
    'Return only the summary.',
  ]
    .filter((line) => typeof line === 'string' && line.trim().length > 0)
    .join('\n')

  const instructions = buildInstructions({
    base: baseInstructions,
    overrides: { promptOverride, lengthInstruction, languageInstruction } satisfies PromptOverrides,
  })
  const context = headerLines.join('\n')

  return buildTaggedPrompt({
    instructions,
    context,
    content: '',
  })
}

export function buildFileTextSummaryPrompt({
  filename,
  originalMediaType,
  contentMediaType,
  outputLanguage,
  summaryLength,
  contentLength,
  content,
  promptOverride,
  lengthInstruction,
  languageInstruction,
}: {
  filename: string | null
  originalMediaType: string | null
  contentMediaType: string
  summaryLength: SummaryLengthTarget
  contentLength: number
  outputLanguage?: OutputLanguage | null
  content?: string | null
  promptOverride?: string | null
  lengthInstruction?: string | null
  languageInstruction?: string | null
}): string {
  const shouldIgnoreSponsors = Boolean(
    originalMediaType?.startsWith('audio/') || originalMediaType?.startsWith('video/')
  )
  const effectiveSummaryLength =
    typeof summaryLength === 'string'
      ? summaryLength
      : summaryLength.maxCharacters > contentLength
        ? { maxCharacters: contentLength }
        : summaryLength
  const preset =
    typeof effectiveSummaryLength === 'string'
      ? effectiveSummaryLength
      : pickSummaryLengthForCharacters(effectiveSummaryLength.maxCharacters)
  const directive = resolveSummaryLengthSpec(preset)
  const presetLengthLine =
    typeof effectiveSummaryLength === 'string' ? formatPresetLengthGuidance(preset) : ''
  const maxCharactersLine =
    typeof effectiveSummaryLength === 'string'
      ? ''
      : `Target length: up to ${effectiveSummaryLength.maxCharacters.toLocaleString()} characters total (including Markdown and whitespace). Hard limit: do not exceed it.`

  const headerLines = [
    filename ? `Filename: ${filename}` : null,
    originalMediaType ? `Original media type: ${originalMediaType}` : null,
    `Provided as: ${contentMediaType}`,
    `Extracted content length: ${contentLength.toLocaleString()} characters. Hard limit: never exceed this length. If the requested length is larger, do not pad—finish early rather than adding filler.`,
  ].filter(Boolean)

  const baseInstructions = [
    'Hard rules: never mention sponsor/ads; never output quotation marks of any kind (straight or curly), even for titles.',
    'Never include quotation marks in the output. Apostrophes in contractions are OK. If a title or excerpt would normally use quotes, remove them and optionally italicize the text instead.',
    'You summarize files for curious users.',
    'Summarize the file content below.',
    'Be factual and do not invent details.',
    shouldIgnoreSponsors
      ? 'Omit sponsor messages, ads, promos, and calls-to-action (including podcast ad reads), even if they appear in the transcript. Do not mention or acknowledge them, and do not say you skipped or ignored anything. Avoid sponsor/ad/promo language, brand names like Squarespace, or CTA phrases like discount code.'
      : '',
    directive.guidance,
    directive.formatting,
    'Format the answer in Markdown.',
    'Use short paragraphs; use bullet lists only when they improve scanability; avoid rigid templates.',
    'If a standout line is present, include 1-2 short exact excerpts (max 25 words each) formatted as Markdown italics using single asterisks only. Do not use quotation marks of any kind (straight or curly). Remove any quotation marks from excerpts. If you cannot format an italic excerpt, omit it. Never include ad/sponsor/boilerplate excerpts and do not mention them.',
    'Do not use emojis.',
    presetLengthLine,
    maxCharactersLine,
    formatOutputLanguageInstruction(outputLanguage ?? { kind: 'auto' }),
    'Final check: remove any sponsor/ad references or mentions of skipping/ignoring content. Remove any quotation marks. Ensure standout excerpts are italicized; otherwise omit them.',
    'Return only the summary.',
  ]
    .filter((line) => typeof line === 'string' && line.trim().length > 0)
    .join('\n')

  const instructions = buildInstructions({
    base: baseInstructions,
    overrides: { promptOverride, lengthInstruction, languageInstruction } satisfies PromptOverrides,
  })
  const context = headerLines.join('\n')
  const contentText = typeof content === 'string' ? content : ''

  return buildTaggedPrompt({
    instructions,
    context,
    content: contentText,
  })
}
