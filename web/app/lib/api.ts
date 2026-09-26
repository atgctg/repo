import { createORPCClient, ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterContractClient } from '@orpc/contract'
import { createFrameClient } from 'shared'
import type {
  EvalRun,
  EvalVerdict,
  RawMessage,
  Story,
  StorySummary,
  TurnMessage,
  World,
  WorldSource,
} from 'shared'
import type { Contract } from 'shared/contract'

const api: RouterContractClient<Contract> = createORPCClient(new RPCLink({ url: '/api' }))
const frames = createFrameClient({ url: '/api' })

async function found<T>(call: Promise<T>): Promise<T | undefined> {
  try {
    return await call
  } catch (error) {
    if (error instanceof ORPCError && error.code === 'NOT_FOUND') return undefined
    throw error
  }
}

export function fetchWorlds(): Promise<World[]> {
  return api.worlds.list()
}

export function fetchWorld(id: string): Promise<WorldSource | undefined> {
  return found(api.worlds.get({ id }))
}

export function fetchStories(): Promise<StorySummary[]> {
  return api.stories.list()
}

export function fetchStory(id: string): Promise<Story | undefined> {
  return found(api.stories.get({ id }))
}

export function postFork(world: string, id: string): Promise<Story> {
  return api.worlds.fork({ world, id })
}

export async function streamTurn(
  id: string,
  text: string,
  at: number | undefined,
  selected: number[] | undefined,
  onMessage: (message: TurnMessage) => void,
  signal: AbortSignal,
): Promise<void> {
  for await (const message of frames.turn({ id, text, at, selected }, { signal }))
    onMessage(message)
}

export function postGenerate(
  id: string,
  name: string,
  type: 'image' | 'video',
): Promise<Story> {
  return type === 'video'
    ? api.stories.generateVideo({ id, name })
    : api.stories.generateImage({ id, name })
}

export function fetchMessages(id: string): Promise<RawMessage[] | undefined> {
  return found(api.stories.messages({ id }))
}

export function fetchEvalRuns(): Promise<EvalRun[]> {
  return api.evals.list()
}

export function writeVerdict(id: string, verdict: EvalVerdict | null): Promise<void> {
  return api.stories.setVerdict({ id, verdict })
}
