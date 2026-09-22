import type { ToolCall } from './messages'

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
    const parsed = JSON.parse(trimmed) as unknown
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
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
