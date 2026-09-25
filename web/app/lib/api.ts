import { isPlainObject, readTurn, type TurnMessage } from 'shared'
import type { Story, StorySummary, World, WorldSource } from 'shared'

async function errorText(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null)
  if (isPlainObject(body) && typeof body.error === 'string' && body.error)
    return body.error
  return `Request failed (${res.status})`
}

async function request(path: string, init?: RequestInit): Promise<Response | undefined> {
  const res = await fetch(path, init)
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(await errorText(res))
  return res
}

async function getJson(path: string): Promise<unknown> {
  return (await request(path, { cache: 'no-store' }))?.json()
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const res = await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res) throw new Error('Request failed (404)')
  return res.json()
}

function listOf<T>(body: unknown, guard: (value: unknown) => value is T): T[] {
  return Array.isArray(body) ? body.filter(guard) : []
}

export function isStory(value: unknown): value is Story {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    typeof value.world === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.events)
  )
}

function isWorld(value: unknown): value is World {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string'
  )
}

function isWorldSource(value: unknown): value is WorldSource {
  return isWorld(value) && Array.isArray((value as WorldSource).events)
}

function isSummary(value: unknown): value is StorySummary {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    typeof value.world === 'string' &&
    typeof value.title === 'string' &&
    typeof value.updatedAt === 'string' &&
    typeof value.preview === 'string'
  )
}

const path = (...parts: string[]) => `/api/${parts.map(encodeURIComponent).join('/')}`

export async function fetchWorlds(): Promise<World[]> {
  return listOf(await getJson(path('worlds')), isWorld)
}

export async function fetchWorld(id: string): Promise<WorldSource | undefined> {
  const body = await getJson(path('worlds', id))
  return isWorldSource(body) ? body : undefined
}

export async function fetchStories(): Promise<StorySummary[]> {
  return listOf(await getJson(path('stories')), isSummary)
}

export async function fetchStory(id: string): Promise<Story | undefined> {
  const body = await getJson(path('stories', id))
  return isStory(body) ? body : undefined
}

export async function postFork(worldId: string, id: string): Promise<Story> {
  const body = await postJson(path('worlds', worldId, 'fork'), { id })
  if (!isStory(body)) throw new Error('Fork failed')
  return body
}

export async function streamTurn(
  id: string,
  text: string,
  at: number | undefined,
  selected: number[] | undefined,
  onMessage: (message: TurnMessage) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(path('stories', id, 'turn'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      text,
      ...(at === undefined ? {} : { at }),
      ...(selected ? { selected } : {}),
    }),
  })
  if (!res.ok) throw new Error(await errorText(res))
  if (!res.body) throw new Error('Turn failed')
  await readTurn(res.body, onMessage)
}

export async function postGenerate(
  id: string,
  name: string,
  type: 'image' | 'video',
): Promise<Story | undefined> {
  const action = type === 'video' ? 'generate-video' : 'generate-image'
  const payload = type === 'video' ? { name, duration: 5 } : { name }
  const body = await postJson(path('stories', id, action), payload)
  return isPlainObject(body) && isStory(body.story) ? body.story : undefined
}

export type RawMessage = {
  role: string
  content?: string
  name?: string
  tool_calls?: unknown
  tool_call_id?: string
}

function isRawMessage(value: unknown): value is RawMessage {
  return isPlainObject(value) && typeof value.role === 'string'
}

export async function fetchMessages(id: string): Promise<RawMessage[] | undefined> {
  const body = await getJson(path('stories', id, 'messages'))
  return body === undefined ? undefined : listOf(body, isRawMessage)
}

export type EvalVerdict = 'pass' | 'fail'

export type EvalRun = {
  id: string
  caseName: string
  description: string
  verdict: EvalVerdict | null
}

function isVerdict(value: unknown): value is EvalVerdict | null {
  return value === null || value === 'pass' || value === 'fail'
}

function isEvalRun(value: unknown): value is EvalRun {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    typeof value.caseName === 'string' &&
    typeof value.description === 'string' &&
    isVerdict(value.verdict)
  )
}

export async function fetchEvalRuns(): Promise<EvalRun[]> {
  return listOf(await getJson(path('evals')), isEvalRun)
}

export async function writeVerdict(
  id: string,
  verdict: EvalVerdict | null,
): Promise<void> {
  await postJson(path('stories', id, 'eval'), { verdict })
}
