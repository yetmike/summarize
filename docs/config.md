# Config

`summarize` supports an optional JSON config file for defaults.

## Location

Default path:

- `~/.summarize/config.json`

## Precedence

For `model`:

1. CLI flag `--model`
2. Env `SUMMARIZE_MODEL`
3. Config file `model`
4. Built-in default (`auto`)

## Format

`~/.summarize/config.json`:

```json
{
  "model": { "id": "google/gemini-3-flash-preview" }
}
```

Shorthand (equivalent):

```json
{
  "model": "google/gemini-3-flash-preview"
}
```

`model` can also be auto:

```json
{
  "model": { "mode": "auto" }
}
```

Shorthand (equivalent):

```json
{
  "model": "auto"
}
```

`model` can also be free-only (OpenRouter `:free` models):

```json
{
  "model": { "mode": "free" }
}
```

Shorthand (equivalent):

```json
{
  "model": "free"
}
```

For auto selection with rules:

```json
{
  "model": {
    "mode": "auto",
    "rules": [
      {
        "when": ["video"],
        "candidates": ["google/gemini-3-flash-preview"]
      },
      {
        "when": ["website", "youtube"],
        "bands": [
          {
            "token": { "max": 8000 },
            "candidates": ["openai/gpt-5-nano"]
          },
          {
            "candidates": ["xai/grok-4-fast-non-reasoning"]
          }
        ]
      },
      {
        "candidates": ["openai/gpt-5-nano", "openrouter/openai/gpt-5-nano"]
      }
    ]
  },
  "media": { "videoMode": "auto" }
}
```

Notes:

- Parsed leniently (JSON5), but **comments are not allowed**.
- `model.rules` is optional. If omitted, built-in defaults apply.
- `model.rules[].when` (optional) must be an array (e.g. `["video","youtube"]`).
- `model.rules[]` must use either `candidates` or `bands`.
