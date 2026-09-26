import { adminOk } from './auth'
import type { AssetStore } from './assets'
import { enterApp, type Secrets } from './context'
import { openDatabase } from './db'
import { handle } from './server'

export type Env = Secrets & {
  HYPERDRIVE: { connectionString: string }
  ASSETS: AssetStore
}

type WaitCtx = {
  waitUntil: (promise: Promise<unknown>) => void
}

export function holdDatabase(
  response: Response,
  ctx: WaitCtx,
  background: Promise<unknown>[],
  close: () => Promise<void>,
): Response {
  let released = false
  const release = () => {
    if (released) return
    released = true
    ctx.waitUntil(
      (async () => {
        try {
          let seen = 0
          while (seen < background.length) {
            const batch = background.slice(seen)
            seen = background.length
            await Promise.allSettled(batch)
          }
        } finally {
          await close()
        }
      })(),
    )
  }
  const body = response.body
  if (!body) {
    release()
    return response
  }
  const reader = body.getReader()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      let finished = false
      try {
        const next = await reader.read()
        if (next.done) {
          finished = true
          controller.close()
          return
        }
        controller.enqueue(next.value)
      } catch (error) {
        finished = true
        controller.error(error)
      } finally {
        if (finished) release()
      }
    },
    cancel(reason) {
      release()
      return reader.cancel(reason)
    },
  })
  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

export default {
  async fetch(request: Request, env: Env, ctx: WaitCtx): Promise<Response> {
    if (!(await adminOk(request, env.ADMIN_PASSWORD))) {
      return new Response('Unauthorized', { status: 401 })
    }
    const opened = await openDatabase(env.HYPERDRIVE.connectionString)
    const background: Promise<unknown>[] = []
    try {
      const response = await enterApp(
        {
          db: opened.db,
          assets: env.ASSETS,
          env,
          waitUntil(promise) {
            background.push(promise)
            ctx.waitUntil(promise)
          },
        },
        () => handle(request),
      )
      return holdDatabase(response, ctx, background, () => opened.close())
    } catch (error) {
      ctx.waitUntil(opened.close())
      throw error
    }
  },
}
