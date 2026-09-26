import { hasBody, storyKey, worldKey } from './assets'
import { app } from './context'
import { assetContentType, safeAssetFile, safeStoryId } from './files'
import { handleFrames } from './frames'
import { rpc } from './router'
import { storyWorld } from './stories'

const notFound = () => new Response('Not found', { status: 404 })

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
  const framed = await handleFrames(request)
  if (framed) return framed
  const { matched, response } = await rpc.handle(request, { prefix: '/api' })
  if (matched) return response
  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean).map(segment)
  if (request.method !== 'GET' || parts[0] !== 'assets') return notFound()
  if (parts.length === 4 && parts[1] === 'worlds') {
    return worldAsset(request, parts[2] ?? '', parts[3] ?? '')
  }
  return parts.length === 3
    ? storyAsset(request, parts[1] ?? '', parts[2] ?? '')
    : notFound()
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
