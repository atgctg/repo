import { FRAME_ROUTES, turnResponse } from 'shared'
import { frames } from 'shared/contract'
import type * as z from 'zod'
import { app } from './context'
import { runEvalCase } from './eval-runs'
import { errorMessage } from './media'
import { storyExists, StoryError } from './stories'
import { reply } from './turn'

function held(work: Promise<void>): Promise<void> {
  app().waitUntil(work.catch(() => undefined))
  return work
}

const jsonError = (error: string, status: number) => Response.json({ error }, { status })

async function readInput<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.output<T> | Response> {
  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (parsed.success) return parsed.data
  return jsonError(parsed.error.issues[0]?.message ?? 'invalid input', 400)
}

async function turn(request: Request): Promise<Response> {
  const input = await readInput(request, frames.turn)
  if (input instanceof Response) return input
  const { id, ...rest } = input
  if (!(await storyExists(id))) return jsonError('Story not found', 404)
  return turnResponse(
    (send, signal) => held(reply(id, rest, send, signal)),
    request.signal,
  )
}

async function evalRun(request: Request): Promise<Response> {
  const input = await readInput(request, frames.evalRun)
  if (input instanceof Response) return input
  return turnResponse(
    (send, signal) => held(runEvalCase(input.name, send, signal)),
    request.signal,
  )
}

const routes: Record<string, (request: Request) => Promise<Response>> = {
  [`/api/${FRAME_ROUTES.turn}`]: turn,
  [`/api/${FRAME_ROUTES.evalRun}`]: evalRun,
}

export async function handleFrames(request: Request): Promise<Response | undefined> {
  const route = routes[new URL(request.url).pathname]
  if (!route || request.method !== 'POST') return undefined
  try {
    return await route(request)
  } catch (error) {
    if (error instanceof StoryError) return jsonError(error.message, error.status)
    return jsonError(errorMessage(error), 500)
  }
}
