export type StreamOutputMode = 'line' | 'delta'

export function createStreamOutputGate({
  stdout,
  clearProgressForStdout,
  outputMode,
  richTty,
}: {
  stdout: NodeJS.WritableStream
  clearProgressForStdout: () => void
  outputMode: StreamOutputMode
  richTty: boolean
}) {
  let cleared = false
  let plainFlushedLen = 0

  const ensureCleared = () => {
    if (cleared) return
    clearProgressForStdout()
    if (richTty) stdout.write('\n')
    cleared = true
  }

  const flush = (text: string) => {
    clearProgressForStdout()
    stdout.write(text)
  }

  const handleChunk = (streamed: string, prevStreamed: string) => {
    if (plainFlushedLen === 0) {
      const match = streamed.match(/^\n+/)
      if (match) plainFlushedLen = match[0].length
    }

    if (outputMode === 'line') {
      const lastNl = streamed.lastIndexOf('\n')
      if (lastNl >= 0 && lastNl + 1 > plainFlushedLen) {
        ensureCleared()
        flush(streamed.slice(plainFlushedLen, lastNl + 1))
        plainFlushedLen = lastNl + 1
      }
      return
    }

    const isAppendOnly = streamed.startsWith(prevStreamed)
    if (streamed.length > plainFlushedLen && isAppendOnly) {
      ensureCleared()
      flush(streamed.slice(plainFlushedLen))
      plainFlushedLen = streamed.length
      return
    }
    if (!isAppendOnly) {
      ensureCleared()
      flush(streamed)
      plainFlushedLen = streamed.length
    }
  }

  const finalize = (finalText: string) => {
    const remaining = plainFlushedLen < finalText.length ? finalText.slice(plainFlushedLen) : ''
    if (remaining) stdout.write(remaining)
    const endedWithNewline = remaining
      ? remaining.endsWith('\n')
      : plainFlushedLen > 0 && finalText[plainFlushedLen - 1] === '\n'
    if (!endedWithNewline) stdout.write('\n')
  }

  return { handleChunk, finalize, getFlushedLen: () => plainFlushedLen }
}
