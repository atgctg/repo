import { turnResponse } from 'shared'
import { resolveAssetKey, worldKey } from './assets'
import { app } from './context'
import { runEvalCase, listEvalRuns, setVerdict, type EvalVerdict } from './eval-runs'
import { assetContentType, safeAssetFile, safeStoryId } from './files'
import { errorMessage } from './media'
import {
  forkWorld,
  generateImage,
  generateVideo,
  listStories,
  loadStory,
  storyExists,
  storyWorld,
  StoryError,
} from './stories'
import { llmMessages, reply } from './turn'
import { listWorlds, loadWorld, worldExists } from './worlds'

function jsonError(error: unknown, status = 500): Response {
  if (error instanceof StoryError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  return Response.json({ error: errorMessage(error) }, { status })
}

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text()
  if (!text.trim()) return {}
  return JSON.parse(text) as unknown
}

function readVoice(value: unknown): { audio: string; transcript: string } | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const voice = value as { audio?: unknown; transcript?: unknown }
  if (typeof voice.audio !== 'string' || typeof voice.transcript !== 'string')
    return undefined
  return { audio: voice.audio, transcript: voice.transcript }
}

function segment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

async function assetResponse(key: string, file: string): Promise<Response> {
  const object = await app().assets.get(key)
  if (!object?.body) return new Response('Not found', { status: 404 })
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', assetContentType(file))
  headers.set('Cache-Control', 'no-store')
  return new Response(object.body, { headers })
}

export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean).map(segment)
  try {
    return await route(request.method, parts, request)
  } catch (error) {
    return jsonError(error)
  }
}

async function route(
  method: string,
  parts: string[],
  request: Request,
): Promise<Response> {
  if (
    method === 'GET' &&
    parts.length === 2 &&
    parts[0] === 'api' &&
    parts[1] === 'worlds'
  ) {
    return Response.json(await listWorlds())
  }
  if (
    method === 'GET' &&
    parts.length === 3 &&
    parts[0] === 'api' &&
    parts[1] === 'worlds'
  ) {
    const world = await loadWorld(parts[2] ?? '')
    if (!world) return new Response('Not found', { status: 404 })
    return Response.json(world)
  }
  if (
    method === 'POST' &&
    parts.length === 4 &&
    parts[0] === 'api' &&
    parts[1] === 'worlds' &&
    parts[3] === 'fork'
  ) {
    return fork(request, parts[2] ?? '')
  }
  if (
    method === 'GET' &&
    parts.length === 2 &&
    parts[0] === 'api' &&
    parts[1] === 'evals'
  ) {
    return Response.json(await listEvalRuns())
  }
  if (
    method === 'POST' &&
    parts.length === 4 &&
    parts[0] === 'api' &&
    parts[1] === 'evals' &&
    parts[3] === 'run'
  ) {
    return turnResponse(async (send) => {
      await runEvalCase(parts[2] ?? '', send, request.signal)
    })
  }
  if (
    method === 'GET' &&
    parts.length === 2 &&
    parts[0] === 'api' &&
    parts[1] === 'stories'
  ) {
    return Response.json(await listStories())
  }
  if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'stories') {
    return storyAction(method, parts[2] ?? '', parts[3] ?? '', request)
  }
  if (
    method === 'GET' &&
    parts.length === 3 &&
    parts[0] === 'api' &&
    parts[1] === 'stories'
  ) {
    return storyJson(parts[2] ?? '')
  }
  if (
    method === 'GET' &&
    parts.length === 4 &&
    parts[0] === 'assets' &&
    parts[1] === 'worlds'
  ) {
    return worldAsset(parts[2] ?? '', parts[3] ?? '')
  }
  if (method === 'GET' && parts.length === 3 && parts[0] === 'assets') {
    return storyAsset(parts[1] ?? '', parts[2] ?? '')
  }
  return new Response('Not found', { status: 404 })
}

async function fork(request: Request, worldId: string): Promise<Response> {
  let body: unknown
  try {
    body = await readJson(request)
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }
  const requested =
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    typeof (body as { id?: unknown }).id === 'string'
      ? (body as { id: string }).id
      : undefined
  try {
    return Response.json(await forkWorld(worldId, requested))
  } catch (error) {
    return jsonError(error)
  }
}

async function storyAction(
  method: string,
  id: string,
  action: string,
  request: Request,
): Promise<Response> {
  switch (action) {
    case 'eval':
      return method === 'POST'
        ? setEval(request, id)
        : new Response('Not found', { status: 404 })
    case 'messages':
      return method === 'GET' ? messages(id) : new Response('Not found', { status: 404 })
    case 'turn':
      return method === 'POST'
        ? turn(request, id)
        : new Response('Not found', { status: 404 })
    case 'generate-image':
      return method === 'POST'
        ? generateImageRoute(request, id)
        : new Response('Not found', { status: 404 })
    case 'generate-video':
      return method === 'POST'
        ? generateVideoRoute(request, id)
        : new Response('Not found', { status: 404 })
    default:
      return new Response('Not found', { status: 404 })
  }
}

async function setEval(request: Request, id: string): Promise<Response> {
  let body: { verdict?: unknown }
  try {
    body = (await readJson(request)) as { verdict?: unknown }
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }
  const verdict = body.verdict
  if (verdict !== null && verdict !== 'pass' && verdict !== 'fail') {
    return Response.json(
      { error: 'verdict must be pass, fail, or null' },
      { status: 400 },
    )
  }
  try {
    await setVerdict(id, verdict as EvalVerdict | null)
    return Response.json({ ok: true })
  } catch (error) {
    return jsonError(error)
  }
}

async function messages(id: string): Promise<Response> {
  if (!(await storyExists(id))) return new Response('Not found', { status: 404 })
  try {
    const story = await loadStory(id)
    return Response.json(llmMessages(story.events, story.title))
  } catch (error) {
    return jsonError(error)
  }
}

async function storyJson(id: string): Promise<Response> {
  if (!(await storyExists(id))) return new Response('Not found', { status: 404 })
  try {
    return Response.json(await loadStory(id))
  } catch (error) {
    return jsonError(error)
  }
}

async function turn(request: Request, id: string): Promise<Response> {
  if (!(await storyExists(id))) return new Response('Not found', { status: 404 })
  let body: {
    text?: unknown
    at?: unknown
    selected?: unknown
    pasted?: unknown
    voice?: unknown
  }
  try {
    body = (await readJson(request)) as typeof body
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }
  if (typeof body.text !== 'string' || !body.text.trim()) {
    return Response.json({ error: 'text is required' }, { status: 400 })
  }
  if (
    body.at !== undefined &&
    (typeof body.at !== 'number' || !Number.isInteger(body.at) || body.at < 0)
  ) {
    return Response.json({ error: 'at must be an index' }, { status: 400 })
  }
  const text = body.text
  const at = typeof body.at === 'number' ? body.at : undefined
  const selected = Array.isArray(body.selected)
    ? body.selected.filter(
        (index): index is number => typeof index === 'number' && Number.isInteger(index),
      )
    : undefined
  const pasted = typeof body.pasted === 'string' ? body.pasted : undefined
  const voice = readVoice(body.voice)
  return turnResponse(async (send) => {
    await reply(id, { text, at, selected, pasted, voice }, send, request.signal)
  })
}

async function generateImageRoute(request: Request, id: string): Promise<Response> {
  if (!(await storyExists(id))) return new Response('Not found', { status: 404 })
  const body = (await request.json()) as { name?: unknown }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return Response.json({ error: 'name is required' }, { status: 400 })
  }
  try {
    const result = await generateImage(id, { name: body.name.trim() })
    return Response.json(result)
  } catch (error) {
    console.error('img gen error', {
      storyId: id,
      name: body.name.trim(),
      error: error instanceof Error ? error.message : String(error),
    })
    return jsonError(error)
  }
}

async function generateVideoRoute(request: Request, id: string): Promise<Response> {
  if (!(await storyExists(id))) return new Response('Not found', { status: 404 })
  const body = (await request.json()) as { name?: unknown; duration?: unknown }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return Response.json({ error: 'name is required' }, { status: 400 })
  }
  const duration = body.duration === undefined ? 5 : body.duration
  if (
    typeof duration !== 'number' ||
    !Number.isInteger(duration) ||
    duration < 5 ||
    duration > 15
  ) {
    return Response.json(
      { error: 'duration must be an integer from 5 to 15' },
      { status: 400 },
    )
  }
  try {
    const result = await generateVideo(id, { name: body.name.trim(), duration })
    return Response.json(result)
  } catch (error) {
    console.error('video gen error', {
      storyId: id,
      name: body.name.trim(),
      error: error instanceof Error ? error.message : String(error),
    })
    return jsonError(error)
  }
}

async function worldAsset(worldIdRaw: string, file: string): Promise<Response> {
  const worldId = safeStoryId(worldIdRaw)
  if (!safeAssetFile(file) || !(await worldExists(worldId))) {
    return new Response('Not found', { status: 404 })
  }
  return assetResponse(worldKey(worldId, file), file)
}

async function storyAsset(storyIdRaw: string, file: string): Promise<Response> {
  const storyId = safeStoryId(storyIdRaw)
  if (!safeAssetFile(file)) return new Response('Not found', { status: 404 })
  const worldId = await storyWorld(storyId)
  if (!worldId) return new Response('Not found', { status: 404 })
  const key = await resolveAssetKey(app().assets, storyId, worldId, file)
  if (!key) return new Response('Not found', { status: 404 })
  return assetResponse(key, file)
}
