# CLI models

Summarize can use installed CLIs (Claude, Codex, Gemini) as local model backends.

## Model ids

- `cli/claude/<model>` (e.g. `cli/claude/sonnet`)
- `cli/codex/<model>` (e.g. `cli/codex/gpt-5.2`)
- `cli/gemini/<model>` (e.g. `cli/gemini/gemini-3-flash-preview`)

## Auto mode

When a CLI is installed, auto mode prepends CLI attempts before API models in this order:
Claude → Gemini → Codex.

Control which CLIs are considered:

- `cli.enabled` is an allowlist (when omitted, all three are enabled).
- Set `cli.enabled: []` to disable all CLI attempts in auto mode.

Disable globally:

```json
{
  "cli": { "prefer": false }
}
```

Disable per provider:

```json
{
  "cli": { "enabled": ["claude"] }
}
```

## CLI discovery

Binary lookup:

- `CLAUDE_PATH`, `CODEX_PATH`, `GEMINI_PATH` (optional overrides)
- Otherwise uses `PATH`

## Attachments (images/files)

When a CLI attempt is used for an image or non-text file, Summarize switches to a
path-based prompt and enables the required tool flags:

- Claude: `--tools Read --dangerously-skip-permissions`
- Gemini: `--yolo` and `--include-directories <dir>`
- Codex: `codex exec --output-last-message ...` and `-i <image>` for images

## Config

```json
{
  "cli": {
    "enabled": ["claude", "gemini", "codex"],
    "prefer": true,
    "disabled": ["claude"],
    "codex": { "model": "gpt-5.2" },
    "gemini": { "model": "gemini-3-flash-preview", "extraArgs": ["--verbose"] },
    "claude": {
      "model": "sonnet",
      "binary": "/usr/local/bin/claude",
      "extraArgs": ["--verbose"]
    }
  }
}
```

Notes:

- CLI output is treated as text only (no token accounting).
- If a CLI call fails, auto mode falls back to the next candidate.
