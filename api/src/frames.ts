import { FRAME_ROUTES, turnResponse, type TurnMessage } from 'shared'
import { frames } from 'shared/contract'
import type * as z from 'zod'
import { app } from './context'
import { runEvalCase } from './eval-runs'
import { errorMessage } from './media'
import { storyExists, StoryError } from './stories'
import { reply } from './turn'

type Run = (send: (message: TurnMessage) => void, signal: AbortSignal) => Promise<void>

async function readInput<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.output<T>> {
  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (parsed.success) return parsed.data
  throw new StoryError(parsed.error.issues[0]?.message ?? 'invalid input', 400)
}

const routes: Record<string, (request: Request) => Promise<Run>> = {
  [`/api/${FRAME_ROUTES.turn}`]: async (request) => {
    const { id, ...input } = await readInput(request, frames.turn)
    if (!(await storyExists(id))) throw new StoryError('Story not found', 404)
    return (send, signal) => reply(id, input, send, signal)
  },
  [`/api/${FRAME_ROUTES.evalRun}`]: async (request) => {
    const { name } = await readInput(request, frames.evalRun)
    return (send, signal) => runEvalCase(name, send, signal)
  },
}

export async function handleFrames(request: Request): Promise<Response | undefined> {
  const route = routes[new URL(request.url).pathname]
  if (!route || request.method !== 'POST') return undefined
  try {
    const run = await route(request)
    return turnResponse((send, signal) => {
      const work = run(send, signal)
      app().waitUntil(work.catch(() => undefined))
      return work
    }, request.signal)
  } catch (error) {
    const status = error instanceof StoryError ? error.status : 500
    return Response.json({ error: errorMessage(error) }, { status })
  }
}
