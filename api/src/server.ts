import { isPlainObject, turnResponse } from 'shared'
import { hasBody, storyKey, worldKey } from './assets'
import { app } from './context'
import { runEvalCase, listEvalRuns, setVerdict } from './eval-runs'
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
import { listWorlds, loadWorld } from './worlds'

function jsonError(error: unknown): Response {
  if (error instanceof StoryError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  return Response.json({ error: errorMessage(error) }, { status: 500 })
}

const notFound = () => new Response('Not found', { status: 404 })

const badRequest = (error: string) => Response.json({ error }, { status: 400 })

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text()
  if (!text.trim()) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new StoryError('invalid json', 400)
  }
  return isPlainObject(parsed) ? parsed : {}
}

function readVoice(value: unknown): { audio: string; transcript: string } | undefined {
  if (!isPlainObject(value)) return undefined
  const { audio, transcript } = value
  if (typeof audio !== 'string' || typeof transcript !== 'string') return undefined
  return { audio, transcript }
}

function segment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

async function assetResponse(
  request: Request,
  key: string,
  file: string,
): Promise<Response | undefined> {
  const object = await app().assets.get(key, { onlyIf: request.headers })
  if (!object) return undefined
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', assetContentType(file))
  headers.set('Cache-Control', 'private, no-cache')
  headers.set('ETag', object.httpEtag)
  if (!hasBody(object)) return new Response(null, { status: 304, headers })
  return new Response(object.body, { headers })
}

export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean).map(segment)
  try {
    return await route(request, parts)
  } catch (error) {
    return jsonError(error)
  }
}

async function route(request: Request, parts: string[]): Promise<Response> {
  const [root = '', collection = '', id = '', action = ''] = parts
  if (parts.length > 4) return notFound()
  if (root === 'assets') {
    if (request.method !== 'GET') return notFound()
    if (parts.length === 4 && collection === 'worlds') {
      return worldAsset(request, id, action)
    }
    return parts.length === 3 ? storyAsset(request, collection, id) : notFound()
  }
  if (root !== 'api') return notFound()
  const path = [collection, parts.length > 2 ? ':id' : '', action].filter(Boolean)
  switch (`${request.method} ${path.join('/')}`) {
    case 'GET worlds':
      return Response.json(await listWorlds())
    case 'GET worlds/:id': {
      const world = await loadWorld(id)
      return world ? Response.json(world) : notFound()
    }
    case 'POST worlds/:id/fork': {
      const body = await readJson(request)
      const requested = typeof body.id === 'string' ? body.id : undefined
      return Response.json(await forkWorld(id, requested))
    }
    case 'GET evals':
      return Response.json(await listEvalRuns())
    case 'POST evals/:id/run':
      return turnResponse((send) => runEvalCase(id, send, request.signal))
    case 'GET stories':
      return Response.json(await listStories())
    case 'GET stories/:id':
      return Response.json(await loadStory(id))
    case 'GET stories/:id/messages': {
      const story = await loadStory(id)
      return Response.json(llmMessages(story.events, story.title))
    }
    case 'POST stories/:id/eval':
      return setEval(request, id)
    case 'POST stories/:id/turn':
      return turn(request, id)
    case 'POST stories/:id/generate-image':
      return generateImageRoute(request, id)
    case 'POST stories/:id/generate-video':
      return generateVideoRoute(request, id)
    default:
      return notFound()
  }
}

async function setEval(request: Request, id: string): Promise<Response> {
  const { verdict } = await readJson(request)
  if (verdict !== null && verdict !== 'pass' && verdict !== 'fail') {
    return badRequest('verdict must be pass, fail, or null')
  }
  await setVerdict(id, verdict)
  return Response.json({ ok: true })
}

async function turn(request: Request, id: string): Promise<Response> {
  if (!(await storyExists(id))) return notFound()
  const body = await readJson(request)
  if (typeof body.text !== 'string' || !body.text.trim()) {
    return badRequest('text is required')
  }
  if (
    body.at !== undefined &&
    (typeof body.at !== 'number' || !Number.isInteger(body.at) || body.at < 0)
  ) {
    return badRequest('at must be an index')
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

function assetName(body: Record<string, unknown>): string {
  if (typeof body.name !== 'string' || !body.name.trim()) {
    throw new StoryError('name is required', 400)
  }
  return body.name.trim()
}

async function generateImageRoute(request: Request, id: string): Promise<Response> {
  const name = assetName(await readJson(request))
  return Response.json(await generateImage(id, { name }))
}

async function generateVideoRoute(request: Request, id: string): Promise<Response> {
  const body = await readJson(request)
  const name = assetName(body)
  const duration = body.duration === undefined ? 5 : body.duration
  if (
    typeof duration !== 'number' ||
    !Number.isInteger(duration) ||
    duration < 5 ||
    duration > 15
  ) {
    return badRequest('duration must be an integer from 5 to 15')
  }
  return Response.json(await generateVideo(id, { name, duration }))
}

async function worldAsset(
  request: Request,
  worldIdRaw: string,
  file: string,
): Promise<Response> {
  const worldId = safeStoryId(worldIdRaw)
  if (!safeAssetFile(file)) return notFound()
  return (await assetResponse(request, worldKey(worldId, file), file)) ?? notFound()
}

async function storyAsset(
  request: Request,
  storyIdRaw: string,
  file: string,
): Promise<Response> {
  const storyId = safeStoryId(storyIdRaw)
  if (!safeAssetFile(file)) return notFound()
  const own = await assetResponse(request, storyKey(storyId, file), file)
  if (own) return own
  const worldId = await storyWorld(storyId)
  if (!worldId) return notFound()
  return (await assetResponse(request, worldKey(worldId, file), file)) ?? notFound()
}
