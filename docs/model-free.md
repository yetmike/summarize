# Free model selection (`--model free` / `--model 3`)

`--model free` forces OpenRouter and only tries `openrouter/...:free` models (in order), falling back on any request error.

## Requirements

- `OPENROUTER_API_KEY` must be set.

## Config

Default config file: `~/.summarize/config.json`

```json
{
  "model": {
    "mode": "free",
    "rules": [
      {
        "candidates": [
          "openrouter/deepseek/deepseek-r1:free",
          "openrouter/meta-llama/llama-3.1-8b-instruct:free"
        ]
      }
    ]
  }
}
```

Minimal shorthand:

```json
{
  "model": "free"
}
```
