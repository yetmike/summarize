import { describe, expect, it } from 'vitest'

import { resolveSlideSettings } from '../src/slides/index.js'

describe('resolveSlideSettings', () => {
  it('returns null when slides are disabled', () => {
    const settings = resolveSlideSettings({ cwd: '/tmp' })
    expect(settings).toBeNull()
  })

  it('defaults when slides are enabled', () => {
    const settings = resolveSlideSettings({ slides: true, cwd: '/tmp' })
    expect(settings).not.toBeNull()
    expect(settings?.outputDir).toBe('/tmp/slides')
    expect(settings?.sceneThreshold).toBe(0.3)
    expect(settings?.autoTuneThreshold).toBe(true)
    expect(settings?.maxSlides).toBe(10)
    expect(settings?.minDurationSeconds).toBe(2)
  })

  it('enables OCR when slidesOcr is set', () => {
    const settings = resolveSlideSettings({ slidesOcr: true, cwd: '/tmp' })
    expect(settings?.ocr).toBe(true)
  })

  it('rejects invalid scene threshold', () => {
    expect(() =>
      resolveSlideSettings({ slides: true, slidesSceneThreshold: '2', cwd: '/tmp' })
    ).toThrow(/slides-scene-threshold/i)
  })
})
