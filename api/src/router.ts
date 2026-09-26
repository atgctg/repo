import { implement, ORPCError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { contract } from 'shared/contract'
import { listEvalRuns, setVerdict } from './eval-runs'
import { saveFeedback } from './feedback'
import { errorMessage } from './media'
import {
  forkWorld,
  generateImage,
  generateVideo,
  listStories,
  loadStory,
  StoryError,
} from './stories'
import { llmMessages } from './turn'
import { listWorlds, loadWorld } from './worlds'

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
}

function toRpcError(error: unknown): unknown {
  if (error instanceof ORPCError) return error
  if (error instanceof StoryError) {
    return new ORPCError(CODES[error.status] ?? 'INTERNAL_SERVER_ERROR', {
      message: error.message,
    })
  }
  return new ORPCError('INTERNAL_SERVER_ERROR', { message: errorMessage(error) })
}

const os = implement(contract)

const router = os.router({
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
    generateImage: os.stories.generateImage.handler(({ input }) =>
      generateImage(input.id, input),
    ),
    generateVideo: os.stories.generateVideo.handler(({ input }) =>
      generateVideo(input.id, input),
    ),
    setVerdict: os.stories.setVerdict.handler(({ input }) =>
      setVerdict(input.id, input.verdict),
    ),
  },
  evals: {
    list: os.evals.list.handler(() => listEvalRuns()),
  },
  feedback: {
    create: os.feedback.create.handler(({ input }) =>
      saveFeedback(input.story, input.text),
    ),
  },
})

export const rpc = new RPCHandler(router, {
  clientInterceptors: [
    async ({ next }) => {
      try {
        return await next()
      } catch (error) {
        throw toRpcError(error)
      }
    },
  ],
})
