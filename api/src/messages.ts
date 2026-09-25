import type { StoryEvent } from 'shared'

export type ToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string; name?: string }
  | { role: 'assistant'; content?: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

const OMIT = new Set(['user', 'error', 'width', 'height', 'dominantColor'])

export function eventsToMessages(events: StoryEvent[], summary?: string): ChatMessage[] {
  const messages: ChatMessage[] = []
  if (summary) messages.push({ role: 'system', content: summary })

  let tool = 0
  let index = 0
  while (index < events.length) {
    const event = events[index]
    if (event.user) {
      messages.push(
        event.type === 'message'
          ? { role: 'user', name: event.user, content: event.text }
          : {
              role: 'user',
              name: event.user,
              content: stableStringify(payload(event, true)),
            },
      )
      index += 1
      continue
    }

    const texts: string[] = []
    const toolCalls: ToolCall[] = []
    const results: ChatMessage[] = []
    while (index < events.length && !events[index].user) {
      const current = events[index]
      index += 1
      if (current.type === 'message') {
        texts.push(current.text)
        continue
      }
      const id = String(tool)
      tool += 1
      toolCalls.push({
        id,
        type: 'function',
        function: {
          name: toolName(current),
          arguments: stableStringify(payload(current, false)),
        },
      })
      results.push({ role: 'tool', tool_call_id: id, content: current.error ?? '' })
    }

    messages.push({
      role: 'assistant',
      ...(texts.length > 0 ? { content: texts.join('\n') } : {}),
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    })
    messages.push(...results)
  }

  return messages
}

function toolName(event: Exclude<StoryEvent, { type: 'message' }>): string {
  switch (event.type) {
    case 'image':
    case 'dialogue':
    case 'video':
    case 'card':
    case 'delete':
      return event.type[0].toUpperCase() + event.type.slice(1)
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

function payload(event: StoryEvent, keepType: boolean): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(event).filter(([key, value]) => {
      if (!keepType && key === 'type') return false
      if (OMIT.has(key)) return false
      if (key === 'replace' && value !== true) return false
      return value !== undefined
    }),
  )
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, sortKeys(item)]),
    )
  }
  return value
}
