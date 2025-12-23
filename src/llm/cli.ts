import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { CliConfig, CliProvider } from '../config.js'
import type { ExecFileFn } from '../markitdown.js'

const DEFAULT_BINARIES: Record<CliProvider, string> = {
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini',
}

type RunCliModelOptions = {
  provider: CliProvider
  prompt: string
  model: string | null
  allowTools: boolean
  timeoutMs: number
  env: Record<string, string | undefined>
  execFileImpl?: ExecFileFn
  config: CliConfig | null
  cwd?: string
  extraArgs?: string[]
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

export function isCliDisabled(
  provider: CliProvider,
  config: CliConfig | null | undefined
): boolean {
  if (!config) return false
  if (Array.isArray(config.enabled) && !config.enabled.includes(provider)) return true
  if (Array.isArray(config.disabled) && config.disabled.includes(provider)) return true
  const providerConfig =
    provider === 'claude' ? config.claude : provider === 'codex' ? config.codex : config.gemini
  if (providerConfig?.enabled === false) return true
  return false
}

export function resolveCliBinary(
  provider: CliProvider,
  config: CliConfig | null | undefined,
  env: Record<string, string | undefined>
): string {
  const providerConfig =
    provider === 'claude' ? config?.claude : provider === 'codex' ? config?.codex : config?.gemini
  if (isNonEmptyString(providerConfig?.binary)) return providerConfig.binary.trim()
  const envKey = `SUMMARIZE_CLI_${provider.toUpperCase()}`
  if (isNonEmptyString(env[envKey])) return env[envKey].trim()
  return DEFAULT_BINARIES[provider]
}

async function execCliWithInput({
  execFileImpl,
  cmd,
  args,
  input,
  timeoutMs,
  env,
  cwd,
}: {
  execFileImpl: ExecFileFn
  cmd: string
  args: string[]
  input: string
  timeoutMs: number
  env: Record<string, string | undefined>
  cwd?: string
}): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = execFileImpl(
      cmd,
      args,
      {
        timeout: timeoutMs,
        env: { ...process.env, ...env },
        cwd,
        maxBuffer: 50 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const stderrText =
            typeof stderr === 'string' ? stderr : (stderr as Buffer).toString('utf8')
          const message = stderrText.trim()
            ? `${error.message}: ${stderrText.trim()}`
            : error.message
          reject(new Error(message, { cause: error }))
          return
        }
        const stdoutText = typeof stdout === 'string' ? stdout : (stdout as Buffer).toString('utf8')
        const stderrText = typeof stderr === 'string' ? stderr : (stderr as Buffer).toString('utf8')
        resolve({ stdout: stdoutText, stderr: stderrText })
      }
    )
    if (child.stdin) {
      child.stdin.write(input)
      child.stdin.end()
    }
  })
}

export async function runCliModel({
  provider,
  prompt,
  model,
  allowTools,
  timeoutMs,
  env,
  execFileImpl,
  config,
  cwd,
  extraArgs,
}: RunCliModelOptions): Promise<{ text: string }> {
  const execFileFn = execFileImpl ?? execFile
  const binary = resolveCliBinary(provider, config, env)
  const args: string[] = []

  const providerConfig =
    provider === 'claude' ? config?.claude : provider === 'codex' ? config?.codex : config?.gemini

  if (providerConfig?.extraArgs?.length) {
    args.push(...providerConfig.extraArgs)
  }
  if (extraArgs?.length) {
    args.push(...extraArgs)
  }
  if (provider === 'codex') {
    const outputDir = await fs.mkdtemp(path.join(tmpdir(), 'summarize-codex-'))
    const outputPath = path.join(outputDir, 'last-message.txt')
    args.push('exec', '--output-last-message', outputPath, '--skip-git-repo-check')
    if (model && model.trim().length > 0) {
      args.push('-m', model.trim())
    }
    const { stdout } = await execCliWithInput({
      execFileImpl: execFileFn,
      cmd: binary,
      args,
      input: prompt,
      timeoutMs,
      env,
      cwd,
    })
    if (stdout.trim()) {
      return { text: stdout.trim() }
    }
    const fileText = (await fs.readFile(outputPath, 'utf8')).trim()
    return { text: fileText }
  }

  if (model && model.trim().length > 0) {
    args.push('--model', model.trim())
  }
  args.push('--output-format', 'json')
  if (allowTools) {
    if (provider === 'claude') {
      args.push('--tools', 'Read', '--dangerously-skip-permissions')
    }
    if (provider === 'gemini') {
      args.push('--yolo')
    }
  }

  const { stdout } = await execCliWithInput({
    execFileImpl: execFileFn,
    cmd: binary,
    args,
    input: prompt,
    timeoutMs,
    env,
    cwd,
  })
  const trimmed = stdout.trim()
  if (!trimmed) {
    throw new Error('CLI returned empty output')
  }
  try {
    const parsed = JSON.parse(trimmed) as { result?: string; response?: string }
    const resultText = parsed.result ?? parsed.response
    if (typeof resultText === 'string' && resultText.trim().length > 0) {
      return { text: resultText }
    }
  } catch {
    // fall through to plain text
  }
  return { text: trimmed }
}
