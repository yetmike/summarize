# Summarize (Chrome Extension)

Chrome Side Panel UI for `summarize` (streams summaries into a real Chrome Side Panel).

Docs + setup: `https://summarize.sh`

## Build

- From repo root: `pnpm install`
- Dev: `pnpm -C apps/chrome-extension dev`
- Prod build: `pnpm -C apps/chrome-extension build`

## Load Unpacked

- Chrome → `chrome://extensions` → Developer mode → “Load unpacked”
- Pick: `apps/chrome-extension/.output/chrome-mv3`

## First Run (Pairing)

- Open side panel → “Setup” shows a token + install command.
- Run the command in Terminal (installs LaunchAgent + daemon).
