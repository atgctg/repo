import type { StoryEvent } from 'shared'

export function parseEvents(value: unknown): StoryEvent[] {
  if (!Array.isArray(value)) return []
  const events: StoryEvent[] = []
  for (const item of value) {
    const event = parseEvent(item)
    if (event) events.push(event)
  }
  return events
}

function parseEvent(value: unknown): StoryEvent | undefined {
  if (!isRecord(value)) return undefined
  const shared = typeof value.error === 'string' ? { error: value.error } : {}
  switch (value.type) {
    case 'input':
      return typeof value.text === 'string'
        ? {
            type: 'input',
            text: value.text,
            ...selected(value),
            ...pasted(value),
            ...voice(value),
            ...shared,
          }
        : undefined
    case 'output':
      return typeof value.text === 'string'
        ? { type: 'output', text: value.text, ...shared }
        : undefined
    case 'image':
      return typeof value.name === 'string'
        ? { type: 'image', ...media(value), ...insert(value), ...shared }
        : undefined
    case 'video':
      return typeof value.name === 'string'
        ? {
            type: 'video',
            ...media(value),
            ...frames(value),
            ...insert(value),
            ...shared,
          }
        : undefined
    case 'dialogue': {
      if (typeof value.background !== 'string') return undefined
      const speaker = typeof value.speaker === 'string' ? value.speaker : undefined
      const caption = typeof value.caption === 'string' ? value.caption : undefined
      return {
        type: 'dialogue',
        background: value.background,
        ...(speaker ? { speaker } : {}),
        ...(caption ? { caption } : {}),
        ...insert(value),
        ...shared,
      }
    }
    case 'card':
      if (typeof value.name !== 'string') return undefined
      return {
        type: 'card',
        name: value.name,
        ...cardLinks(value),
        ...(isRecord(value.attributes) ? { attributes: value.attributes } : {}),
        ...shared,
      }
    case 'delete': {
      if (!Array.isArray(value.indices)) return undefined
      return {
        type: 'delete',
        indices: value.indices.filter(
          (index): index is number => typeof index === 'number',
        ),
        ...shared,
      }
    }
    default:
      return undefined
  }
}

function media(value: Record<string, unknown>): {
  name: string
  prompt?: Record<string, unknown>
  width?: number
  height?: number
  dominantColor?: string
  references?: string[]
} {
  const references = Array.isArray(value.references)
    ? value.references.filter((item): item is string => typeof item === 'string')
    : []
  return {
    name: typeof value.name === 'string' ? value.name : '',
    ...(isRecord(value.prompt) ? { prompt: value.prompt } : {}),
    ...(typeof value.width === 'number' ? { width: value.width } : {}),
    ...(typeof value.height === 'number' ? { height: value.height } : {}),
    ...(typeof value.dominantColor === 'string'
      ? { dominantColor: value.dominantColor }
      : {}),
    ...(references.length > 0 ? { references } : {}),
  }
}

function frames(value: Record<string, unknown>): {
  firstFrame?: string
  lastFrame?: string
  duration?: number
} {
  return {
    ...(typeof value.firstFrame === 'string' ? { firstFrame: value.firstFrame } : {}),
    ...(typeof value.lastFrame === 'string' ? { lastFrame: value.lastFrame } : {}),
    ...(typeof value.duration === 'number' ? { duration: value.duration } : {}),
  }
}

function selected(value: Record<string, unknown>): { selected?: number[] } {
  if (!Array.isArray(value.selected)) return {}
  const indices = value.selected.filter(
    (index): index is number => typeof index === 'number' && Number.isInteger(index),
  )
  return indices.length > 0 ? { selected: indices } : {}
}

function pasted(value: Record<string, unknown>): { pasted?: string } {
  return typeof value.pasted === 'string' && value.pasted ? { pasted: value.pasted } : {}
}

function voice(value: Record<string, unknown>): {
  voice?: { audio: string; transcript: string }
} {
  if (!isRecord(value.voice)) return {}
  const audio = value.voice.audio
  const transcript = value.voice.transcript
  if (typeof audio !== 'string' || typeof transcript !== 'string') return {}
  return { voice: { audio, transcript } }
}

export function cardLinks(value: Record<string, unknown>): {
  cover?: string | null
  voice?: string | null
} {
  const { cover, voice } = value
  return {
    ...(isLink(cover) ? { cover } : {}),
    ...(isLink(voice) ? { voice } : {}),
  }
}

function isLink(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function insert(value: Record<string, unknown>): { index?: number; replace?: boolean } {
  return {
    ...(typeof value.index === 'number' ? { index: value.index } : {}),
    ...(value.replace === true ? { replace: true } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
