import { errorMessage } from './media'
import { turnResponse } from 'shared'
import {
  generateImage,
  generateVideo,
  listStories,
  loadStory,
  storyExists,
  storyWorld,
  StoryError,
  forkWorld,
} from './stories'
import { llmMessages, reply } from './turn'
import { openDatabase, useDatabase } from './db'
import { resolveAssetPath, safeAssetFile, safeStoryId, worldAssetPath } from './files'
import { listEvalRuns, setVerdict, type EvalVerdict } from './eval'
import { loadWorld, listWorlds, worldExists } from './worlds'

function jsonError(error: unknown, status = 500): Response {
  if (error instanceof StoryError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  return Response.json({ error: errorMessage(error) }, { status })
}

function assetContentType(file: string): string {
  if (file.endsWith('.mp4')) return 'video/mp4'
  if (file.endsWith('.wav')) return 'audio/wav'
  return 'image/jpeg'
}

function assetResponse(file: string, asset: Bun.BunFile): Response {
  return new Response(asset, {
    headers: {
      'Content-Type': assetContentType(file),
      'Cache-Control': 'no-store',
    },
  })
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

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}
const opened = await openDatabase(connectionString)
useDatabase(opened.db)

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  development: {
    hmr: true,
    console: true,
  },
  routes: {
    '/api/worlds': {
      GET: async () => Response.json(await listWorlds()),
    },
    '/api/worlds/:id': {
      GET: async (req) => {
        const world = await loadWorld(req.params.id)
        if (!world) return new Response('Not found', { status: 404 })
        return Response.json(world)
      },
    },
    '/api/worlds/:id/fork': {
      POST: async (req) => {
        let body: unknown
        try {
          body = await readJson(req)
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
          return Response.json(await forkWorld(req.params.id, requested))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
    '/api/evals': {
      GET: async () => Response.json(await listEvalRuns()),
    },
    '/api/stories': {
      GET: async () => Response.json(await listStories()),
    },
    '/api/stories/:id/eval': {
      POST: async (req) => {
        let body: { verdict?: unknown }
        try {
          body = (await readJson(req)) as { verdict?: unknown }
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
          await setVerdict(req.params.id, verdict as EvalVerdict | null)
          return Response.json({ ok: true })
        } catch (error) {
          return jsonError(error)
        }
      },
    },
    '/api/stories/:id/messages': {
      GET: async (req) => {
        if (!(await storyExists(req.params.id)))
          return new Response('Not found', { status: 404 })
        try {
          const story = await loadStory(req.params.id)
          return Response.json(llmMessages(story.events, story.title))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
    '/api/stories/:id': {
      GET: async (req) => {
        if (!(await storyExists(req.params.id)))
          return new Response('Not found', { status: 404 })
        try {
          return Response.json(await loadStory(req.params.id))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
    '/api/stories/:id/turn': {
      POST: async (req) => {
        const { id } = req.params
        if (!(await storyExists(id))) return new Response('Not found', { status: 404 })
        let body: {
          text?: unknown
          at?: unknown
          selected?: unknown
          pasted?: unknown
          voice?: unknown
        }
        try {
          body = (await readJson(req)) as {
            text?: unknown
            at?: unknown
            selected?: unknown
            pasted?: unknown
            voice?: unknown
          }
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
              (index): index is number =>
                typeof index === 'number' && Number.isInteger(index),
            )
          : undefined
        const pasted = typeof body.pasted === 'string' ? body.pasted : undefined
        const voice = readVoice(body.voice)
        return turnResponse(async (send) => {
          await reply(id, { text, at, selected, pasted, voice }, send, req.signal)
        })
      },
    },
    '/api/stories/:id/generate-image': {
      POST: async (req) => {
        const { id } = req.params
        if (!(await storyExists(id))) return new Response('Not found', { status: 404 })
        const body = (await req.json()) as { name?: unknown }
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
      },
    },
    '/api/stories/:id/generate-video': {
      POST: async (req) => {
        const { id } = req.params
        if (!(await storyExists(id))) return new Response('Not found', { status: 404 })
        const body = (await req.json()) as { name?: unknown; duration?: unknown }
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
          const result = await generateVideo(id, {
            name: body.name.trim(),
            duration,
          })
          return Response.json(result)
        } catch (error) {
          console.error('video gen error', {
            storyId: id,
            name: body.name.trim(),
            error: error instanceof Error ? error.message : String(error),
          })
          return jsonError(error)
        }
      },
    },
    '/assets/worlds/:worldId/:file': {
      GET: async (req) => {
        const worldId = safeStoryId(req.params.worldId)
        const file = req.params.file
        if (!safeAssetFile(file) || !(await worldExists(worldId))) {
          return new Response('Not found', { status: 404 })
        }
        const asset = Bun.file(worldAssetPath(worldId, file))
        if (!(await asset.exists())) return new Response('Not found', { status: 404 })
        return assetResponse(file, asset)
      },
    },
    '/assets/:storyId/:file': {
      GET: async (req) => {
        const storyId = safeStoryId(req.params.storyId)
        const file = req.params.file
        if (!safeAssetFile(file)) return new Response('Not found', { status: 404 })
        const worldId = await storyWorld(storyId)
        if (!worldId) return new Response('Not found', { status: 404 })
        const diskPath = await resolveAssetPath(storyId, worldId, file)
        if (!diskPath) return new Response('Not found', { status: 404 })
        return assetResponse(file, Bun.file(diskPath))
      },
    },
    '/favicon.ico': Bun.file(`${import.meta.dir}/../favicon.ico`),
  },
})

console.log(`Studio running at ${server.url}`)
