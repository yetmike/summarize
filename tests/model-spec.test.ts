import { describe, expect, it } from 'vitest'

import { parseRequestedModelId } from '../src/model-spec.js'

describe('model spec parsing', () => {
  it('parses free mode', () => {
    expect(parseRequestedModelId('free').kind).toBe('free')
    expect(parseRequestedModelId('3').kind).toBe('free')
  })
})
