import { isPlainObject } from 'shared'
import { app } from './context'
import type { ChatMessage, ToolCall } from './messages'
import { STORY_TOOLS } from './tools'

const MODEL = 'accounts/fireworks/models/deepseek-v4p1-flash'

export type OpenTool = {
  id: string
  name: string
  arguments: string
  done: boolean
}

export type ToolDelta = {
  index?: number
  id?: string
  function?: { name?: string; arguments?: string }
}

export function noteToolDelta(calls: OpenTool[], delta: ToolDelta): ToolCall[] {
  const index =
    typeof delta.index === 'number'
      ? delta.index
      : calls.length === 0
        ? 0
        : calls.findIndex((call) => !call.done)
  const at = index < 0 ? calls.length : index
  while (calls.length <= at) calls.push({ id: '', name: '', arguments: '', done: false })
  const call = calls[at]
  if (!call.done) {
    if (delta.id) call.id = delta.id
    if (delta.function?.name) call.name += delta.function.name
    if (delta.function?.arguments) call.arguments += delta.function.arguments
  }
  return takeReady(calls)
}

export function finishTools(calls: OpenTool[]): ToolCall[] {
  const ready: ToolCall[] = []
  for (const call of calls) {
    if (call.done || !call.name) continue
    call.done = true
    ready.push(asCall(call))
  }
  return ready
}

function takeReady(calls: OpenTool[]): ToolCall[] {
  const ready: ToolCall[] = []
  for (const call of calls) {
    if (call.done) continue
    if (!call.id || !call.name || !argumentsReady(call.arguments)) break
    call.done = true
    ready.push(asCall(call))
  }
  return ready
}

function argumentsReady(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false
  try {
    return isPlainObject(JSON.parse(trimmed))
  } catch {
    return false
  }
}

function asCall(call: OpenTool): ToolCall {
  return {
    id: call.id,
    type: 'function',
    function: { name: call.name, arguments: call.arguments },
  }
}

type StreamPart = { type: 'text'; text: string } | { type: 'tool'; call: ToolCall }

export async function* streamCompletion(
  messages: ChatMessage[],
  signal: AbortSignal | undefined,
  onUsage: (tokens: number) => void,
): AsyncGenerator<StreamPart> {
  const apiKey = app().env.FIREWORKS_API_KEY?.trim()
  if (!apiKey) throw new Error('FIREWORKS_API_KEY is required')
  const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: STORY_TOOLS,
      tool_choice: 'auto',
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal,
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Fireworks error: ${body.slice(0, 500)}`)
  }
  if (!response.body) throw new Error('Fireworks returned no stream')

  const calls: OpenTool[] = []
  for await (const data of sseData(response.body)) {
    if (data === '[DONE]') break
    let parsed: {
      choices?: Array<{
        delta?: { content?: string | null; tool_calls?: ToolDelta[] | null }
      }>
    }
    try {
      parsed = JSON.parse(data) as typeof parsed
    } catch {
      continue
    }
    const tokens = completionTokens(parsed)
    if (tokens !== undefined) onUsage(tokens)
    const delta = parsed.choices?.[0]?.delta
    if (!delta) continue
    if (typeof delta.content === 'string' && delta.content)
      yield { type: 'text', text: delta.content }
    for (const tool of delta.tool_calls ?? []) {
      for (const call of noteToolDelta(calls, tool)) yield { type: 'tool', call }
    }
  }
  for (const call of finishTools(calls)) yield { type: 'tool', call }
}

export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buf += decoder.decode(value, { stream: !done })
      const parts = buf.split('\n\n')
      buf = done ? '' : (parts.pop() ?? '')
      for (const part of parts) {
        const data = part
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('')
        if (data) yield data
      }
      if (done) break
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

function completionTokens(value: unknown): number | undefined {
  if (!isPlainObject(value) || !isPlainObject(value.usage)) return undefined
  const tokens = value.usage.completion_tokens ?? value.usage.output_tokens
  return typeof tokens === 'number' && Number.isFinite(tokens) ? tokens : undefined
}
