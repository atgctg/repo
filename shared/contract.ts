import { oc, type } from '@orpc/contract'
import * as z from 'zod'
import type {
  EvalRun,
  RawMessage,
  Story,
  StorySummary,
  World,
  WorldSource,
} from './types'

const id = z.string().min(1)
const byId = z.object({ id })

export const frames = {
  turn: z.object({
    id,
    text: z.string().trim().min(1, 'text is required'),
    at: z.int().min(0).optional(),
    selected: z.array(z.int()).optional(),
    pasted: z.string().optional(),
    voice: z.object({ audio: z.string(), transcript: z.string() }).optional(),
  }),
  evalRun: z.object({ name: id }),
}

export type FrameInputs = { [K in keyof typeof frames]: z.input<(typeof frames)[K]> }

export const contract = {
  worlds: {
    list: oc.output(type<World[]>()),
    get: oc.input(byId).output(type<WorldSource>()),
    fork: oc
      .input(z.object({ world: id, id: z.string().optional() }))
      .output(type<Story>()),
  },
  stories: {
    list: oc.output(type<StorySummary[]>()),
    get: oc.input(byId).output(type<Story>()),
    messages: oc.input(byId).output(type<RawMessage[]>()),
    generateImage: oc
      .input(z.object({ id, name: z.string().trim().min(1) }))
      .output(type<Story>()),
    generateVideo: oc
      .input(
        z.object({
          id,
          name: z.string().trim().min(1),
          duration: z.int().min(5).max(15).default(5),
        }),
      )
      .output(type<Story>()),
    setVerdict: oc
      .input(z.object({ id, verdict: z.enum(['pass', 'fail']).nullable() }))
      .output(type<void>()),
  },
  evals: {
    list: oc.output(type<EvalRun[]>()),
  },
}

export type Contract = typeof contract
