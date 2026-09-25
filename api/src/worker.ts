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

export default {
  async fetch(request: Request, env: Env, ctx: WaitCtx): Promise<Response> {
    if (!adminOk(request, env.ADMIN_PASSWORD)) {
      return new Response('Unauthorized', { status: 401 })
    }
    const connectionString = env.HYPERDRIVE.connectionString
    if (!connectionString) {
      return Response.json({ error: 'HYPERDRIVE is not configured' }, { status: 500 })
    }
    const opened = await openDatabase(connectionString)
    const background: Promise<unknown>[] = []
    try {
      return await enterApp(
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
    } finally {
      ctx.waitUntil(Promise.allSettled(background).then(() => opened.close()))
    }
  },
}
