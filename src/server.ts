import studio from './client/index.html'
import { safeStoryId, storyAssetPath } from './files'
import { errorMessage } from './media'
import { generateImage, generateVideo, listStories, loadStory, storyExists } from './stories'
import { reply } from './turn'

function jsonError(error: unknown, status = 500): Response {
  return Response.json({ error: errorMessage(error) }, { status })
}

function assetContentType(file: string): string {
  if (file.endsWith('.mp4')) return 'video/mp4'
  if (file.endsWith('.wav')) return 'audio/wav'
  return 'image/jpeg'
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  development: {
    hmr: true,
    console: true,
  },
  routes: {
    '/api/stories': {
      GET: async () => Response.json(await listStories()),
    },
    '/api/stories/:id': {
      GET: async (req) => {
        const { id } = req.params
        if (!(await storyExists(id))) {
          return new Response('Not found', { status: 404 })
        }
        return Response.json(await loadStory(id))
      },
    },
    '/api/stories/:id/turn': {
      POST: async (req) => {
        const { id } = req.params
        if (!(await storyExists(id))) {
          return new Response('Not found', { status: 404 })
        }
        const body = (await req.json()) as { text?: unknown; at?: unknown }
        if (typeof body.text !== 'string' || !body.text.trim()) {
          return Response.json({ error: 'text is required' }, { status: 400 })
        }
        if (body.at !== undefined && (typeof body.at !== 'number' || !Number.isInteger(body.at) || body.at < 0)) {
          return Response.json({ error: 'at must be an index' }, { status: 400 })
        }
        try {
          return Response.json(await reply(id, { text: body.text, at: body.at }))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
    '/api/stories/:id/generate-image': {
      POST: async (req) => {
        const { id } = req.params
        if (!(await storyExists(id))) {
          return new Response('Not found', { status: 404 })
        }
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
        if (!(await storyExists(id))) {
          return new Response('Not found', { status: 404 })
        }
        const body = (await req.json()) as { name?: unknown; duration?: unknown }
        if (typeof body.name !== 'string' || !body.name.trim()) {
          return Response.json({ error: 'name is required' }, { status: 400 })
        }
        const duration = body.duration === undefined ? 5 : body.duration
        if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 5 || duration > 15) {
          return Response.json({ error: 'duration must be an integer from 5 to 15' }, { status: 400 })
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
    '/assets/:storyId/:file': {
      GET: async (req) => {
        const storyId = safeStoryId(req.params.storyId)
        const file = req.params.file
        if (!/^[a-z0-9-]+\.(jpg|mp4|wav)$/.test(file)) {
          return new Response('Not found', { status: 404 })
        }
        const diskPath = storyAssetPath(storyId, file)
        const asset = Bun.file(diskPath)
        if (!(await asset.exists())) {
          return new Response('Not found', { status: 404 })
        }
        return new Response(asset, {
          headers: { 'Content-Type': assetContentType(file), 'Cache-Control': 'no-store' },
        })
      },
    },
    '/favicon.ico': Bun.file(`${import.meta.dir}/client/favicon.ico`),
    '/': studio,
    '/*': studio,
  },
})

console.log(`Studio running at ${server.url}`)
