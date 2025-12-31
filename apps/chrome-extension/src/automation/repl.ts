import { executeNavigateTool } from './navigate'
import { listSkills } from './skills-store'

export type ReplArgs = {
  title: string
  code: string
}

export type SandboxFile = {
  fileName: string
  mimeType: string
  contentBase64: string
}

type BrowserJsResult = {
  ok: boolean
  value?: unknown
  logs?: string[]
  error?: string
}

type ReplResult = {
  output: string
  files?: SandboxFile[]
}

const NAVIGATION_PATTERNS = [
  /\bwindow\.location\s*=\s*['"`]/i,
  /\blocation\.href\s*=\s*['"`]/i,
  /\bwindow\.location\.href\s*=\s*['"`]/i,
  /\blocation\.assign\s*\(/i,
  /\blocation\.replace\s*\(/i,
  /\bwindow\.location\.assign\s*\(/i,
  /\bwindow\.location\.replace\s*\(/i,
  /\bhistory\.back\s*\(/i,
  /\bhistory\.forward\s*\(/i,
  /\bhistory\.go\s*\(/i,
]

function validateReplCode(code: string): void {
  for (const pattern of NAVIGATION_PATTERNS) {
    if (pattern.test(code)) {
      throw new Error('Use navigate() instead of window.location/history inside REPL code.')
    }
  }
}

async function ensureAutomationContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-scripts/automation.js'],
    })
  } catch {
    // ignore
  }
}

async function sendReplOverlay(
  tabId: number,
  action: 'show' | 'hide',
  message?: string
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'automation:repl-overlay',
      action,
      message: message ?? null,
    })
    return
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const noReceiver =
      msg.includes('Receiving end does not exist') || msg.includes('Could not establish connection')
    if (!noReceiver) return
  }

  await ensureAutomationContentScript(tabId)
  await new Promise((resolve) => setTimeout(resolve, 120))
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'automation:repl-overlay',
      action,
      message: message ?? null,
    })
  } catch {
    // ignore
  }
}

async function hasDebuggerPermission(): Promise<boolean> {
  return chrome.permissions.contains({ permissions: ['debugger'] })
}

async function runBrowserJs(fnSource: string, args: unknown[] = []): Promise<BrowserJsResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab')

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-scripts/automation.js'],
    })
  } catch {
    // ignore (optional; used for native input bridge + picker)
  }

  const skills = await listSkills(tab.url ?? undefined)
  const libraries = skills.map((skill) => skill.library).filter(Boolean)
  const nativeInputEnabled = await hasDebuggerPermission()

  const payload = { fnSource, libraries, nativeInputEnabled, args }

  const userScripts = chrome.userScripts as
    | {
        execute?: (options: {
          target: { tabId: number; allFrames?: boolean }
          world: 'USER_SCRIPT'
          worldId?: string
          injectImmediately?: boolean
          js: Array<{ code: string }>
        }) => Promise<Array<{ result?: unknown }>>
        configureWorld?: (options: {
          worldId: string
          messaging?: boolean
          csp?: string
        }) => Promise<void>
      }
    | undefined

  if (userScripts?.execute) {
    const hasPermission = await chrome.permissions.contains({ permissions: ['userScripts'] })
    if (!hasPermission) {
      throw new Error(
        'User Scripts permission is required. Enable it in Options → Automation permissions, then allow “User Scripts” in chrome://extensions.'
      )
    }

    const argsJson = (() => {
      try {
        return JSON.stringify(args ?? [])
      } catch {
        return '[]'
      }
    })()

    const libs = libraries.filter(Boolean).join('\n')
    const wrapperCode = `
      (async () => {
        const logs = []
        const capture = (...args) => {
          logs.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))
        }
        const originalLog = console.log
        console.log = (...args) => {
          capture(...args)
          originalLog(...args)
        }

        const postNativeInput = (payload) => {
          if (!${nativeInputEnabled ? 'true' : 'false'}) {
            throw new Error('Native input requires debugger permission')
          }
          return new Promise((resolve, reject) => {
            const requestId = \`\${Date.now()}-\${Math.random().toString(36).slice(2)}\`
            const handler = (event) => {
              if (event.source !== window) return
              const msg = event.data || {}
              if (msg?.source !== 'summarize-native-input' || msg.requestId !== requestId) return
              window.removeEventListener('message', handler)
              if (msg.ok) resolve(true)
              else reject(new Error(msg.error || 'Native input failed'))
            }
            window.addEventListener('message', handler)
            window.postMessage({ source: 'summarize-native-input', requestId, payload }, '*')
          })
        }

        const attachNativeHelpers = () => {
          const resolveElement = (selector) => {
            const el = document.querySelector(selector)
            if (!el) throw new Error(\`Element not found: \${selector}\`)
            return el
          }

          window.nativeClick = async (selector) => {
            const el = resolveElement(selector)
            const rect = el.getBoundingClientRect()
            await postNativeInput({ action: 'click', x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
          }

          window.nativeType = async (selector, text) => {
            const el = resolveElement(selector)
            el.focus()
            await postNativeInput({ action: 'type', text })
          }

          window.nativePress = async (key) => {
            await postNativeInput({ action: 'press', key })
          }

          window.nativeKeyDown = async (key) => {
            await postNativeInput({ action: 'keydown', key })
          }

          window.nativeKeyUp = async (key) => {
            await postNativeInput({ action: 'keyup', key })
          }
        }

        try {
          ${libs}
          attachNativeHelpers()
          const fn = (${fnSource})
          const args = ${argsJson}
          const value = await fn(...args)
          return { ok: true, value, logs }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { ok: false, error: message, logs }
        } finally {
          console.log = originalLog
        }
      })()
    `

    try {
      await userScripts.configureWorld?.({
        worldId: 'summarize-browserjs',
        messaging: false,
        csp: "script-src 'unsafe-eval' 'unsafe-inline'; connect-src 'none'; img-src 'none'; media-src 'none'; frame-src 'none'; font-src 'none'; object-src 'none'; default-src 'none';",
      })
    } catch {
      // ignore
    }

    const results = await userScripts.execute({
      target: { tabId: tab.id },
      world: 'USER_SCRIPT',
      worldId: 'summarize-browserjs',
      injectImmediately: true,
      js: [{ code: wrapperCode }],
    })

    const result = results?.[0]?.result as BrowserJsResult | undefined
    return result ?? { ok: false, error: 'No result from browserjs()' }
  }

  const injection: chrome.scripting.ScriptInjection = {
    target: { tabId: tab.id },
    func: (data: {
      fnSource: string
      libraries: string[]
      nativeInputEnabled: boolean
      args: unknown[]
    }) => {
      const logs: string[] = []
      const capture = (...args: unknown[]) => {
        logs.push(
          args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')
        )
      }
      const originalLog = console.log
      console.log = (...args: unknown[]) => {
        capture(...args)
        originalLog(...args)
      }

      const runSnippet = (snippet: string) => {
        const fn = new Function(snippet)
        fn()
      }

      const postNativeInput = (payload: Record<string, unknown>) => {
        if (!data.nativeInputEnabled) {
          throw new Error('Native input requires debugger permission')
        }
        return new Promise((resolve, reject) => {
          const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
          const handler = (event: MessageEvent) => {
            if (event.source !== window) return
            const msg = event.data as {
              source?: string
              requestId?: string
              ok?: boolean
              error?: string
            }
            if (msg?.source !== 'summarize-native-input' || msg.requestId !== requestId) return
            window.removeEventListener('message', handler)
            if (msg.ok) resolve(true)
            else reject(new Error(msg.error || 'Native input failed'))
          }
          window.addEventListener('message', handler)
          window.postMessage({ source: 'summarize-native-input', requestId, payload }, '*')
        })
      }

      const attachNativeHelpers = () => {
        const resolveElement = (selector: string) => {
          const el = document.querySelector(selector)
          if (!el) throw new Error(`Element not found: ${selector}`)
          return el as HTMLElement
        }

        ;(window as unknown as { nativeClick?: (selector: string) => Promise<void> }).nativeClick =
          async (selector: string) => {
            const el = resolveElement(selector)
            const rect = el.getBoundingClientRect()
            await postNativeInput({
              action: 'click',
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
            })
          }

        ;(
          window as unknown as { nativeType?: (selector: string, text: string) => Promise<void> }
        ).nativeType = async (selector: string, text: string) => {
          const el = resolveElement(selector)
          el.focus()
          await postNativeInput({ action: 'type', text })
        }

        ;(window as unknown as { nativePress?: (key: string) => Promise<void> }).nativePress =
          async (key: string) => {
            await postNativeInput({ action: 'press', key })
          }

        ;(window as unknown as { nativeKeyDown?: (key: string) => Promise<void> }).nativeKeyDown =
          async (key: string) => {
            await postNativeInput({ action: 'keydown', key })
          }

        ;(window as unknown as { nativeKeyUp?: (key: string) => Promise<void> }).nativeKeyUp =
          async (key: string) => {
            await postNativeInput({ action: 'keyup', key })
          }
      }

      const execute = async () => {
        for (const lib of data.libraries) {
          if (!lib) continue
          runSnippet(lib)
        }
        attachNativeHelpers()
        const fn = new Function(`return (${data.fnSource})`)()
        const value = await fn(...(data.args ?? []))
        return { ok: true as const, value, logs }
      }

      return execute()
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          return { ok: false as const, error: message, logs }
        })
        .finally(() => {
          console.log = originalLog
        })
    },
    args: [payload],
  }

  const [result] = await chrome.scripting.executeScript(injection)

  return (result?.result ?? { ok: false, error: 'No result from browserjs()' }) as BrowserJsResult
}

function buildSandboxHtml(): string {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
      </head>
      <body>
        <script>
          const formatValue = (value) => {
            if (value == null) return 'null'
            if (typeof value === 'string') return value
            try { return JSON.stringify(value) } catch { return String(value) }
          }

          const toBase64 = (input) => {
            if (typeof input === 'string') {
              return btoa(unescape(encodeURIComponent(input)))
            }
            if (input instanceof ArrayBuffer) {
              const bytes = new Uint8Array(input)
              let binary = ''
              bytes.forEach((b) => { binary += String.fromCharCode(b) })
              return btoa(binary)
            }
            if (ArrayBuffer.isView(input)) {
              const bytes = new Uint8Array(input.buffer)
              let binary = ''
              bytes.forEach((b) => { binary += String.fromCharCode(b) })
              return btoa(binary)
            }
            return btoa(unescape(encodeURIComponent(String(input))))
          }

          const sendRpc = (action, payload) => {
            return new Promise((resolve, reject) => {
              const requestId = \`\${Date.now()}-\${Math.random().toString(36).slice(2)}\`
              const handler = (event) => {
                const data = event.data || {}
                if (data.source !== 'summarize-repl' || data.type !== 'rpc-result') return
                if (data.requestId !== requestId) return
                window.removeEventListener('message', handler)
                if (data.ok) resolve(data.result)
                else reject(new Error(data.error || 'RPC failed'))
              }
              window.addEventListener('message', handler)
              window.parent.postMessage(
                { source: 'summarize-repl', type: 'rpc', requestId, action, payload },
                '*'
              )
            })
          }

          window.addEventListener('message', async (event) => {
            const data = event.data || {}
            if (data.source !== 'summarize-repl' || data.type !== 'execute') return

            const { requestId, code } = data
            const logs = []
            const files = []

            const original = { ...console }
            const capture = (...args) => {
              logs.push(args.map((arg) => formatValue(arg)).join(' '))
            }
            console.log = (...args) => { capture(...args); original.log(...args) }
            console.info = (...args) => { capture(...args); original.info(...args) }
            console.warn = (...args) => { capture(...args); original.warn(...args) }
            console.error = (...args) => { capture(...args); original.error(...args) }

            const browserjs = async (fn, ...args) => {
              if (typeof fn !== 'function') throw new Error('browserjs() expects a function')
              const result = await sendRpc('browserjs', { fnSource: fn.toString(), args })
              if (result && typeof result === 'object' && '__browserLogs' in result) {
                const payload = result
                if (Array.isArray(payload.__browserLogs)) {
                  logs.push(...payload.__browserLogs)
                }
                return payload.value
              }
              return result
            }

            const navigate = async (args) => sendRpc('navigate', args)

            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

            const returnFile = (fileNameOrObj, maybeContent, maybeMimeType) => {
              let fileName = ''
              let content = ''
              let mimeType = 'text/plain'
              if (typeof fileNameOrObj === 'object' && fileNameOrObj) {
                fileName = fileNameOrObj.fileName || fileNameOrObj.name || ''
                content = fileNameOrObj.content ?? ''
                mimeType = fileNameOrObj.mimeType || fileNameOrObj.type || mimeType
              } else {
                fileName = String(fileNameOrObj || '')
                content = maybeContent ?? ''
                mimeType = maybeMimeType || mimeType
              }
              if (!fileName) {
                throw new Error('returnFile() requires a fileName')
              }
              const contentBase64 = toBase64(content)
              files.push({ fileName, mimeType, contentBase64 })
            }

            try {
              const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
              const fn = new AsyncFunction('browserjs', 'navigate', 'sleep', 'returnFile', 'console', code)
              const result = await fn(browserjs, navigate, sleep, returnFile, console)
              if (result !== undefined) {
                logs.push(\`=> \${formatValue(result)}\`)
              }
              window.parent.postMessage(
                { source: 'summarize-repl', type: 'result', requestId, ok: true, logs, files },
                '*'
              )
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              window.parent.postMessage(
                { source: 'summarize-repl', type: 'result', requestId, ok: false, error: message, logs, files },
                '*'
              )
            } finally {
              console.log = original.log
              console.info = original.info
              console.warn = original.warn
              console.error = original.error
            }
          })
        </script>
      </body>
    </html>
  `
}

async function runSandboxedRepl(
  code: string,
  handlers: {
    onBrowserJs: (payload: { fnSource: string; args: unknown[] }) => Promise<unknown>
    onNavigate: (payload: { url: string; newTab?: boolean }) => Promise<unknown>
  }
): Promise<{ logs: string[]; files: SandboxFile[]; error?: string }> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.style.display = 'none'
  iframe.srcdoc = buildSandboxHtml()
  document.body.appendChild(iframe)

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return new Promise((resolve) => {
    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      iframe.remove()
    }

    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return
      const data = event.data as {
        source?: string
        type?: string
        requestId?: string
        action?: string
        payload?: unknown
        ok?: boolean
        result?: unknown
        error?: string
        logs?: string[]
        files?: SandboxFile[]
      }
      if (data?.source !== 'summarize-repl') return
      if (data.type === 'rpc' && data.requestId) {
        const handle = async () => {
          try {
            if (data.action === 'browserjs') {
              const result = await handlers.onBrowserJs(
                data.payload as { fnSource: string; args: unknown[] }
              )
              iframe.contentWindow?.postMessage(
                {
                  source: 'summarize-repl',
                  type: 'rpc-result',
                  requestId: data.requestId,
                  ok: true,
                  result,
                },
                '*'
              )
            } else if (data.action === 'navigate') {
              const result = await handlers.onNavigate(
                data.payload as { url: string; newTab?: boolean }
              )
              iframe.contentWindow?.postMessage(
                {
                  source: 'summarize-repl',
                  type: 'rpc-result',
                  requestId: data.requestId,
                  ok: true,
                  result,
                },
                '*'
              )
            } else {
              iframe.contentWindow?.postMessage(
                {
                  source: 'summarize-repl',
                  type: 'rpc-result',
                  requestId: data.requestId,
                  ok: false,
                  error: `Unknown action: ${data.action}`,
                },
                '*'
              )
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            iframe.contentWindow?.postMessage(
              {
                source: 'summarize-repl',
                type: 'rpc-result',
                requestId: data.requestId,
                ok: false,
                error: message,
              },
              '*'
            )
          }
        }
        void handle()
        return
      }

      if (data.type === 'result' && data.requestId === requestId) {
        cleanup()
        resolve({
          logs: data.logs ?? [],
          files: data.files ?? [],
          error: data.ok ? undefined : data.error || 'Execution failed',
        })
      }
    }

    window.addEventListener('message', onMessage)

    const sendExecute = () => {
      iframe.contentWindow?.postMessage(
        { source: 'summarize-repl', type: 'execute', requestId, code },
        '*'
      )
    }

    if (iframe.contentWindow?.document?.readyState === 'complete') {
      sendExecute()
    } else {
      iframe.addEventListener('load', sendExecute, { once: true })
    }
  })
}

export async function executeReplTool(args: ReplArgs): Promise<ReplResult> {
  if (!args.code?.trim()) throw new Error('Missing code')
  validateReplCode(args.code)

  const usesBrowserJs = args.code.includes('browserjs(')
  let overlayTabId: number | null = null
  if (usesBrowserJs) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      overlayTabId = tab.id
      await sendReplOverlay(overlayTabId, 'show', args.title || 'Running automation')
    }
  }

  try {
    const sandboxResult = await runSandboxedRepl(args.code, {
      onBrowserJs: async ({ fnSource, args: fnArgs }) => {
        const res = await runBrowserJs(fnSource, fnArgs)
        if (!res.ok) throw new Error(res.error || 'browserjs failed')
        if (res.logs?.length) {
          return { value: res.value, __browserLogs: res.logs }
        }
        return res.value
      },
      onNavigate: async (input) => executeNavigateTool(input),
    })

    const logs = sandboxResult.logs ?? []
    if (sandboxResult.files?.length) {
      logs.push(`[Files returned: ${sandboxResult.files.length}]`)
      for (const file of sandboxResult.files) {
        logs.push(`- ${file.fileName} (${file.mimeType})`)
      }
    }
    if (sandboxResult.error) {
      logs.push(`Error: ${sandboxResult.error}`)
    }
    const output = logs.join('\n').trim() || 'Code executed successfully (no output)'
    return {
      output,
      files: sandboxResult.files?.length ? sandboxResult.files : undefined,
    }
  } finally {
    if (overlayTabId) {
      await sendReplOverlay(overlayTabId, 'hide')
    }
  }
}
