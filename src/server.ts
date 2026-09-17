import studio from './client/index.html'
import { errorMessage, mediaDiskPath, safeStoryId } from './generate'
import { generateImage, listStories, loadStory, storyExists } from './stories'

function jsonError(error: unknown, status = 500): Response {
  return Response.json({ error: errorMessage(error) }, { status })
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
    '/api/stories/:id/generate': {
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
          const result = await generateImage(id, body.name.trim())
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
    '/media/:storyId/:file': {
      GET: async (req) => {
        const storyId = safeStoryId(req.params.storyId)
        const file = req.params.file
        if (!/^[a-z0-9-]+\.jpg$/.test(file)) {
          return new Response('Not found', { status: 404 })
        }
        const image = Bun.file(mediaDiskPath(storyId, file.replace(/\.jpg$/, '')))
        if (!(await image.exists())) {
          return new Response('Not found', { status: 404 })
        }
        return new Response(image, {
          headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
        })
      },
    },
    '/favicon.ico': Bun.file(`${import.meta.dir}/client/favicon.ico`),
    '/': studio,
    '/*': studio,
  },
})

console.log(`Studio running at ${server.url}`)
