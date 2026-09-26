import { implement, ORPCError } from '@orpc/server'
import { contract } from 'shared/contract'
import { listEvalRuns, setVerdict } from './eval-runs'
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

export function toRpcError(error: unknown): unknown {
  if (error instanceof ORPCError) return error
  if (error instanceof StoryError) {
    return new ORPCError(CODES[error.status] ?? 'INTERNAL_SERVER_ERROR', {
      message: error.message,
    })
  }
  return new ORPCError('INTERNAL_SERVER_ERROR', { message: errorMessage(error) })
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
  },
})
