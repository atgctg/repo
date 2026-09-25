import { formatRanges, project, type StoryEvent } from 'shared'

export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function turnView(events: StoryEvent[]): {
  prompt: string
  output: string[]
  context: string[]
} {
  let cut = -1
  for (let index = events.length - 1; index >= 0; index--) {
    if (events[index]?.user) {
      cut = index
      break
    }
  }
  if (cut < 0) return { prompt: '', output: lines(events, 0, events.length), context: [] }
  const promptEvent = events[cut]
  return {
    prompt: promptEvent ? promptText(promptEvent) : '',
    output: lines(events, cut + 1, events.length),
    context: lines(events, 0, cut),
  }
}

function lines(events: StoryEvent[], start: number, end: number): string[] {
  const result: string[] = []
  for (let index = start; index < end; index++) {
    const line = lineAt(events, index)
    if (line) result.push(line)
  }
  return result
}

function promptText(event: StoryEvent): string {
  if (event.type === 'message') return event.text.trim()
  return lineAt([event], 0)
}

function lineAt(events: StoryEvent[], index: number): string {
  const event = events[index]
  if (!event) return ''
  switch (event.type) {
    case 'message':
      return event.text.trim()
    case 'dialogue': {
      const caption = (event.caption ?? '').replace(/\s+/g, ' ').trim()
      return event.speaker ? `${event.speaker}: ${caption}` : caption
    }
    case 'image':
    case 'video': {
      const at = project(events.slice(0, index + 1)).scenes.findIndex(
        (scene) => scene.event === index,
      )
      const kind = event.type === 'image' ? 'image' : 'video'
      return at >= 0 ? `[${at}] ${kind} ${event.name}` : `${kind} ${event.name}`
    }
    case 'delete':
      return `delete ${formatRanges(event.indices)}`
    case 'card':
      return `card ${event.name}`
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}
