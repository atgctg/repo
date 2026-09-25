import type {
  Story,
  StoryEvent,
  StorySummary,
  TurnDone,
  TurnError,
  TurnPhase,
  TurnStatus,
  TurnStreamEvent,
  World,
  WorldSource,
} from 'shared'
import type { EvalRun } from './store'

const PHASES: readonly TurnPhase[] = ['model', 'image', 'video', 'voice']

async function errorText(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null
  if (body && typeof body.error === 'string' && body.error) return body.error
  return `Request failed (${res.status})`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isStory(value: unknown): value is Story {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.world === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.events)
  )
}

function isWorld(value: unknown): value is World {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' && typeof value.title === 'string'
}

function isWorldSource(value: unknown): value is WorldSource {
  return isWorld(value) && Array.isArray((value as WorldSource).events)
}

function isSummary(value: unknown): value is StorySummary {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.world === 'string' &&
    typeof value.title === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

function isPhase(value: unknown): value is TurnPhase {
  return typeof value === 'string' && PHASES.some((phase) => phase === value)
}

function isStatus(value: unknown): value is TurnStatus {
  if (!isRecord(value) || !isPhase(value.phase) || typeof value.startedAt !== 'number')
    return false
  return true
}

function isDone(value: unknown): value is TurnDone {
  return (
    isRecord(value) &&
    typeof value.startedAt === 'number' &&
    typeof value.elapsedMs === 'number'
  )
}

function isError(value: unknown): value is TurnError {
  return isRecord(value) && typeof value.error === 'string'
}

function parseStreamEvent(chunk: string): TurnStreamEvent | undefined {
  let name = ''
  const dataLines: string[] = []
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (!name || dataLines.length === 0) return undefined
  let data: unknown
  try {
    data = JSON.parse(dataLines.join('\n')) as unknown
  } catch {
    return undefined
  }
  switch (name) {
    case 'story':
      return isStory(data) ? { event: 'story', data } : undefined
    case 'status':
      return isStatus(data) ? { event: 'status', data } : undefined
    case 'done':
      return isDone(data) ? { event: 'done', data } : undefined
    case 'error':
      return isError(data) ? { event: 'error', data } : undefined
    default:
      return undefined
  }
}

export async function fetchWorlds(): Promise<World[]> {
  const res = await fetch('/api/worlds', { cache: 'no-store' })
  if (!res.ok) throw new Error(await errorText(res))
  const body = (await res.json()) as unknown
  return Array.isArray(body) ? body.filter(isWorld) : []
}

export async function fetchWorld(id: string): Promise<WorldSource | undefined> {
  const res = await fetch(`/api/worlds/${encodeURIComponent(id)}`, { cache: 'no-store' })
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(await errorText(res))
  const body = (await res.json()) as unknown
  return isWorldSource(body) ? body : undefined
}

export async function fetchStories(): Promise<StorySummary[]> {
  const res = await fetch('/api/stories', { cache: 'no-store' })
  if (!res.ok) throw new Error(await errorText(res))
  const body = (await res.json()) as unknown
  return Array.isArray(body) ? body.filter(isSummary) : []
}

export async function fetchStory(id: string): Promise<Story | undefined> {
  const res = await fetch(`/api/stories/${encodeURIComponent(id)}`, { cache: 'no-store' })
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(await errorText(res))
  const body = (await res.json()) as unknown
  return isStory(body) ? body : undefined
}

export async function postFork(worldId: string, id: string): Promise<Story> {
  const res = await fetch(`/api/worlds/${encodeURIComponent(worldId)}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error(await errorText(res))
  const body = (await res.json()) as unknown
  if (!isStory(body)) throw new Error('Fork failed')
  return body
}

export async function streamTurn(
  id: string,
  text: string,
  at: number | undefined,
  onEvent: (event: TurnStreamEvent) => void,
): Promise<void> {
  const res = await fetch(`/api/stories/${encodeURIComponent(id)}/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(at === undefined ? { text } : { text, at }),
  })
  if (!res.ok) throw new Error(await errorText(res))
  if (!res.body) throw new Error('Turn failed')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const take = (chunk: string) => {
    const event = parseStreamEvent(chunk)
    if (event) onEvent(event)
  }
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) take(part)
  }
  if (buffer.trim()) take(buffer)
}

export async function postGenerate(
  id: string,
  name: string,
  type: 'image' | 'video',
): Promise<Story | undefined> {
  const path = type === 'video' ? 'generate-video' : 'generate-image'
  const payload = type === 'video' ? { name, duration: 5 } : { name }
  const res = await fetch(`/api/stories/${encodeURIComponent(id)}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await errorText(res))
  const body = (await res.json()) as unknown
  if (isRecord(body) && isStory(body.story)) return body.story
  return undefined
}

export async function fetchEvals(): Promise<EvalRun[]> {
  try {
    const res = await fetch('/api/evals', { cache: 'no-store' })
    if (!res.ok) return []
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('json')) return []
    const body = (await res.json()) as unknown
    if (!Array.isArray(body)) return []
    return body.flatMap((item) => {
      if (!isRecord(item)) return []
      const created = item.createdAt ?? item.created_at
      if (typeof item.id !== 'string' || typeof item.name !== 'string') return []
      if (typeof created !== 'number') return []
      return [{ id: item.id, name: item.name, createdAt: created }]
    })
  } catch {
    return []
  }
}

export type { StoryEvent }
