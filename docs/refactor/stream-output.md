---
summary: "Refactor guide: consolidate streaming output gating (line vs delta)."
---

# Refactor: Stream Output Gate

Goal: centralize stdout streaming policy (line‑gated vs delta) and progress clearing.

## Steps
- [x] Inventory output policies.
  - Files: `src/run/summary-engine.ts`, `src/run/progress.ts`, `src/run/streaming.ts`.
- [x] Define `StreamOutputMode` type + helper API.
  - `line` (newline‑gated)
  - `delta` (append/replacement)
- [x] Implement `createStreamOutputGate()`.
  - Manages `plainFlushedLen`, newline handling, progress clear.
- [x] Replace inline loop logic.
  - Move stdout write logic into gate helper.
- [x] Keep markdown streamer path unchanged.
  - Only touch plain streaming path.
- [x] Add regression tests.
  - Reuse `tests/cli.stream-merge.test.ts`.
  - Add line‑gating edge case if needed.
- [x] Verify CLI vs daemon behavior.

## Done When
- No stream output branching inside `summary-engine`.
- One reusable helper for stdout streaming.

## Tests
- `pnpm -s test tests/cli.stream-merge.test.ts tests/cli.streamed-markdown-lines.test.ts`
