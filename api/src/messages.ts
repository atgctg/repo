import { formatInput, project, type Card, type StoryEvent } from 'shared'
import { stringify } from 'yaml'
import { formatScene } from './scene-text'

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

export function eventsToMessages(
  events: StoryEvent[],
  summary?: string,
  title = '',
): ChatMessage[] {
  const messages: ChatMessage[] = []
  if (summary) messages.push({ role: 'system', content: summary })

  const cut = events.findIndex((event) => event.type === 'input')
  const prefix = cut < 0 ? events : events.slice(0, cut)
  const template = prefix.length > 0 ? renderTemplate(title, prefix) : ''
  let framed = template.length === 0
  let tool = 0
  let index = cut < 0 ? events.length : cut
  while (index < events.length) {
    const event = events[index]
    if (event.type === 'input') {
      const text = formatInput(event)
      const content = framed ? text : `${template}\n\n${text}`
      framed = true
      messages.push({ role: 'user', name: 'user', content })
      index += 1
      continue
    }

    const texts: string[] = []
    const toolCalls: ToolCall[] = []
    const results: ChatMessage[] = []
    while (index < events.length && events[index].type !== 'input') {
      const current = events[index]
      index += 1
      if (current.type === 'output') {
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

function renderTemplate(title: string, events: StoryEvent[]): string {
  const { scenes, assets, cards } = project(events)
  const cardBlock = cards.map(formatCard).join('\n')
  const sceneBlock = scenes
    .map((scene, index) => formatScene(scene, index, assets))
    .join('\n')
  return `<template title="${escapeTitle(title)}">
<cards>
${cardBlock}
</cards>
<scenes>
${sceneBlock}
</scenes>
</template>`
}

function formatCard(card: Card): string {
  const fields: Record<string, string> = { name: card.name }
  if (card.cover) fields.cover = card.cover
  if (card.voice) fields.voice = card.voice
  const body = stringify([fields]).trimEnd()
  if (!card.attributes || Object.keys(card.attributes).length === 0) return body
  return `${body}\n  attributes: ${JSON.stringify(card.attributes)}`
}

function escapeTitle(title: string): string {
  return title.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

function toolName(event: Exclude<StoryEvent, { type: 'input' | 'output' }>): string {
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
