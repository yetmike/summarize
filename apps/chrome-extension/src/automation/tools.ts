import type { ToolCall, ToolResultMessage } from '@mariozechner/pi-ai'
import { executeAskUserWhichElementTool } from './ask-user-which-element'
import { executeNavigateTool } from './navigate'
import { executeReplTool } from './repl'
import { executeSkillTool, type SkillToolArgs } from './skills'

const TOOL_NAMES = ['navigate', 'repl', 'ask_user_which_element', 'skill', 'debugger'] as const

export type AutomationToolName = (typeof TOOL_NAMES)[number]

export function getAutomationToolNames(): AutomationToolName[] {
  return [...TOOL_NAMES]
}

function buildToolResultMessage({
  toolCallId,
  toolName,
  text,
  isError,
  details,
}: {
  toolCallId: string
  toolName: string
  text: string
  isError: boolean
  details?: unknown
}): ToolResultMessage {
  return {
    role: 'toolResult',
    toolCallId,
    toolName,
    content: [{ type: 'text', text }],
    details,
    isError,
    timestamp: Date.now(),
  }
}

async function getActiveTabUrl(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.url ?? null
}

async function executeDebuggerTool(args: { action?: string; code?: string }) {
  if (args.action !== 'eval') throw new Error('Unsupported debugger action')
  if (!args.code) throw new Error('Missing code')

  const hasPermission = await chrome.permissions.contains({ permissions: ['debugger'] })
  if (!hasPermission) {
    throw new Error(
      'Debugger permission not granted. Enable it in Options → Automation permissions.'
    )
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab')

  const tabId = tab.id
  try {
    await chrome.debugger.attach({ tabId }, '1.3')
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes('already attached')) {
      throw err
    }
  }

  try {
    const result = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: args.code,
      returnByValue: true,
    })
    const value = result?.result?.value ?? result?.result ?? null
    const text =
      value == null ? 'null' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    return { text, details: result }
  } finally {
    try {
      await chrome.debugger.detach({ tabId })
    } catch {
      // ignore
    }
  }
}

export async function executeToolCall(toolCall: ToolCall): Promise<ToolResultMessage> {
  try {
    if (toolCall.name === 'navigate') {
      const result = await executeNavigateTool(
        toolCall.arguments as { url: string; newTab?: boolean }
      )
      return buildToolResultMessage({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        text: `Navigated to ${result.finalUrl}`,
        isError: false,
        details: result,
      })
    }

    if (toolCall.name === 'repl') {
      const result = await executeReplTool(toolCall.arguments as { title: string; code: string })
      return buildToolResultMessage({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        text: result.output,
        isError: false,
        details: result.files?.length ? { files: result.files } : undefined,
      })
    }

    if (toolCall.name === 'ask_user_which_element') {
      const result = await executeAskUserWhichElementTool(
        toolCall.arguments as { message?: string }
      )
      return buildToolResultMessage({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        text: `Selected ${result.selector}`,
        isError: false,
        details: result,
      })
    }

    if (toolCall.name === 'skill') {
      const result = await executeSkillTool(toolCall.arguments as SkillToolArgs, getActiveTabUrl)
      return buildToolResultMessage({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        text: result.text,
        isError: false,
        details: result.details,
      })
    }

    if (toolCall.name === 'debugger') {
      const result = await executeDebuggerTool(
        toolCall.arguments as { action?: string; code?: string }
      )
      return buildToolResultMessage({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        text: result.text,
        isError: false,
        details: result.details,
      })
    }

    return buildToolResultMessage({
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      text: `Unknown tool: ${toolCall.name}`,
      isError: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return buildToolResultMessage({
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      text: message,
      isError: true,
    })
  }
}
