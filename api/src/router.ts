import { implement, ORPCError } from '@orpc/server'
import type { TurnMessage } from 'shared'
import { contract } from 'shared/contract'
import { listEvalRuns, runEvalCase, setVerdict } from './eval-runs'
import { errorMessage } from './media'
import {
  forkWorld,
  generateImage,
  generateVideo,
  listStories,
  loadStory,
  storyExists,
  StoryError,
} from './stories'
import { llmMessages, reply } from './turn'
import { listWorlds, loadWorld } from './worlds'

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
}

export function toRpcError(error: unknown): unknown {
  if (error instanceof ORPCError) return error
  if (error instanceof Error && error.name === 'AbortError') return error
  if (error instanceof StoryError) {
    return new ORPCError(CODES[error.status] ?? 'INTERNAL_SERVER_ERROR', {
      message: error.message,
    })
  }
  return new ORPCError('INTERNAL_SERVER_ERROR', { message: errorMessage(error) })
}

type Send = (message: TurnMessage) => void

export function turnEvents(
  run: (send: Send, signal: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
): AsyncGenerator<TurnMessage> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const queue: TurnMessage[] = []
  let wake = () => {}
  let finished = false
  let failure: { error: unknown } | undefined
  void run((message) => {
    queue.push(message)
    wake()
  }, controller.signal)
    .catch((error: unknown) => {
      failure = { error }
    })
    .finally(() => {
      finished = true
      signal?.removeEventListener('abort', abort)
      wake()
    })
  return (async function* () {
    try {
      while (true) {
        const next = queue.shift()
        if (next) {
          yield next
          continue
        }
        if (finished) {
          if (failure) throw toRpcError(failure.error)
          return
        }
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }
    } finally {
      if (!finished) abort()
    }
  })()
}

const os = implement(contract)

export const router = os.router({
  worlds: {
    list: os.worlds.list.handler(() => listWorlds()),
    get: os.worlds.get.handler(async ({ input }) => {
      const world = await loadWorld(input.id)
      if (!world) throw new ORPCError('NOT_FOUND', { message: 'World not found' })
      return world
    }),
    fork: os.worlds.fork.handler(({ input }) => forkWorld(input.world, input.id)),
  },
  stories: {
    list: os.stories.list.handler(() => listStories()),
    get: os.stories.get.handler(({ input }) => loadStory(input.id)),
    messages: os.stories.messages.handler(async ({ input }) => {
      const story = await loadStory(input.id)
      return llmMessages(story.events, story.title)
    }),
    turn: os.stories.turn.handler(async ({ input, signal }) => {
      const { id, ...rest } = input
      if (!(await storyExists(id))) throw new StoryError('Story not found', 404)
      return turnEvents((send, stop) => reply(id, rest, send, stop), signal)
    }),
    generateImage: os.stories.generateImage.handler(
      async ({ input }) => (await generateImage(input.id, { name: input.name })).story,
    ),
    generateVideo: os.stories.generateVideo.handler(
      async ({ input }) => (await generateVideo(input.id, input)).story,
    ),
    setVerdict: os.stories.setVerdict.handler(({ input }) =>
      setVerdict(input.id, input.verdict),
    ),
  },
  evals: {
    list: os.evals.list.handler(() => listEvalRuns()),
    run: os.evals.run.handler(({ input, signal }) =>
      turnEvents((send, stop) => runEvalCase(input.name, send, stop), signal),
    ),
  },
})
