import { describe, expect, it } from 'vitest'
import { createStreamController } from '../apps/chrome-extension/src/entrypoints/sidepanel/stream-controller.js'
import { encodeSseEvent, type SseEvent } from '../src/shared/sse-events.js'

const encoder = new TextEncoder()

function streamFromEvents(events: SseEvent[]) {
  const payload = events.map((event) => encodeSseEvent(event)).join('')
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.close()
    },
  })
}

const run = {
  id: 'run-1',
  url: 'https://example.com',
  title: null,
  model: 'auto',
  reason: 'manual',
}

describe('sidepanel stream controller error handling', () => {
  it('keeps error phase when SSE returns an error event', async () => {
    const phases: string[] = []
    const statuses: string[] = []

    const controller = createStreamController({
      getToken: async () => 'token',
      onStatus: (text) => statuses.push(text),
      onPhaseChange: (phase) => phases.push(phase),
      onMeta: () => {},
      fetchImpl: async () =>
        new Response(streamFromEvents([{ event: 'error', data: { message: 'daemon crashed' } }]), {
          status: 200,
        }),
    })

    await controller.start(run)

    expect(phases.at(-1)).toBe('error')
    expect(phases).not.toContain('idle')
    expect(statuses.some((status) => status.includes('Error:'))).toBe(true)
  })

  it('keeps error phase when the fetch fails', async () => {
    const phases: string[] = []

    const controller = createStreamController({
      getToken: async () => 'token',
      onStatus: () => {},
      onPhaseChange: (phase) => phases.push(phase),
      onMeta: () => {},
      fetchImpl: async () => {
        throw new Error('connection refused')
      },
    })

    await controller.start(run)

    expect(phases.at(-1)).toBe('error')
    expect(phases).not.toContain('idle')
  })
})
