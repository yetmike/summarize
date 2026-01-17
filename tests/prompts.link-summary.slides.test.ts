import { describe, expect, it } from 'vitest'

import { buildLinkSummaryPrompt } from '../packages/core/src/prompts/index.js'

describe('buildLinkSummaryPrompt (slides)', () => {
  it('adds slide timeline guidance with overview paragraph first', () => {
    const prompt = buildLinkSummaryPrompt({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Test',
      siteName: 'YouTube',
      description: null,
      content: 'Transcript:\n[0:01] Hello',
      truncated: false,
      hasTranscript: true,
      hasTranscriptTimestamps: true,
      slides: { count: 8, text: 'Slide 1 [0:00–0:30]:\nHello' },
      outputLanguage: { kind: 'fixed', tag: 'en', label: 'English' },
      summaryLength: 'short',
      shares: [],
    })

    expect(prompt).toContain('Start with a short intro paragraph')
    expect(prompt).toContain('Insert each slide marker on its own line')
    expect(prompt).toContain('Use every slide index from 1 to 8 exactly once')
    expect(prompt).toContain('Do not create a dedicated Slides section')
    expect(prompt).not.toContain('Include at least 3 headings')
  })
})
