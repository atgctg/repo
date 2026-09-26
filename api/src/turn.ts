import {
  leadCards,
  project,
  type DeleteEvent,
  type DialogueEvent,
  type ImageEvent,
  type InputEvent,
  type OutputEvent,
  type Story,
  type StoryEvent,
  type TurnMessage,
  type TurnPhase,
  type TurnTiming,
  type VideoEvent,
} from 'shared'
import { app } from './context'
import { assetUrl, storyAssetUrl } from './files'
import systemPrompt from '../prompt.md' with { type: 'text' }
import voicePrompt from '../voice.md' with { type: 'text' }
import {
  errorMessage,
  generateStoryImage,
  generateStoryVideo,
  generateStoryVoice,
  resolveVoiceId,
} from './media'
import { eventsToMessages, type ChatMessage, type ToolCall } from './messages'
import { streamCompletion } from './stream'
import {
  changeStory,
  loadStory,
  persistStory,
  readSceneLines,
  reproject,
  saveTiming,
} from './stories'
import { parseArgs, readRange, toolEvent } from './tools'

const MAX_LOOPS = 6

export function followUp(toolNames: string[]): boolean {
  if (toolNames.length === 0) return false
  if (toolNames.includes('Read')) return true
  return toolNames.every((name) => name === 'Delete')
}

export function llmMessages(events: StoryEvent[], title: string): ChatMessage[] {
  const voiced = events.some((event) => event.type === 'card' && event.voice)
  return [
    {
      role: 'system',
      content: voiced ? `${systemPrompt}\n${voicePrompt}` : systemPrompt,
    },
    ...eventsToMessages(events, undefined, title),
  ]
}

function integers(values: number[] | undefined): number[] {
  return values?.filter((index) => Number.isInteger(index)) ?? []
}

function inputFields(input: {
  selected?: number[]
  pasted?: string
  voice?: InputEvent['voice']
}): Partial<Pick<InputEvent, 'selected' | 'pasted' | 'voice'>> {
  const selected = integers(input.selected)
  return {
    ...(selected.length > 0 ? { selected } : {}),
    ...(input.pasted ? { pasted: input.pasted } : {}),
    ...(input.voice ? { voice: input.voice } : {}),
  }
}

function applyInputFields(
  target: InputEvent,
  input: {
    selected?: number[]
    pasted?: string
    voice?: InputEvent['voice']
  },
): void {
  if (input.selected) {
    const selected = integers(input.selected)
    if (selected.length > 0) target.selected = selected
    else delete target.selected
  }
  if (input.pasted !== undefined) {
    if (input.pasted) target.pasted = input.pasted
    else delete target.pasted
  }
  if (input.voice !== undefined) {
    if (input.voice) target.voice = input.voice
    else delete target.voice
  }
}

export function turnTiming(input: {
  startedAt: number
  endedAt: number
  firstTokenAt?: number
  modelMs: number
  completionTokens: number
  images: number[]
}): TurnTiming {
  const seconds = (ms: number) => Math.round((ms / 1000) * 100) / 100
  const totalMs = Math.max(0, input.endedAt - input.startedAt)
  const ttftMs =
    input.firstTokenAt === undefined
      ? totalMs
      : Math.max(0, input.firstTokenAt - input.startedAt)
  const modelSeconds = input.modelMs / 1000
  return {
    ttft: seconds(ttftMs),
    total: seconds(totalMs),
    tps:
      modelSeconds > 0
        ? Math.round((input.completionTokens / modelSeconds) * 100) / 100
        : 0,
    images: input.images.map((value) => Math.round(value * 100) / 100),
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

function raceAbort<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return work
  const settled = work.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    void settled.then((result) => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) return
      if (result.ok === false) reject(result.error)
      else resolve(result.value)
    })
  })
}

export async function reply(
  storyId: string,
  input: {
    text: string
    at?: number
    selected?: number[]
    pasted?: string
    voice?: InputEvent['voice']
  },
  emit: (message: TurnMessage) => void = () => {},
  signal?: AbortSignal,
  options?: { dry?: boolean },
): Promise<void> {
  const startedAt = Date.now()
  const clock: Clock = { modelMs: 0, completionTokens: 0, images: [] }
  let length = 0
  try {
    await changeStory(storyId, async (current) => {
      length = current.events.length
      const text = input.text.trim()
      const keep = typeof input.at === 'number' ? input.at : current.events.length
      const fields = inputFields(input)
      if (typeof input.at === 'number') {
        const target = current.events[input.at]
        if (target?.type !== 'input') throw new Error('Can only rewind an input')
        target.text = text
        applyInputFields(target, input)
        current.events.splice(input.at + 1)
      } else {
        current.events.push({ type: 'input', text, ...fields })
      }
      await persistStory(current)
      length = current.events.length
      emit({ type: 'start', turn: startedAt, keep })
      const user = current.events[keep]
      if (user) emit({ type: 'event', at: keep, event: user })
      await run(current, {
        dry: options?.dry === true,
        startedAt,
        emit,
        signal,
        clock,
        waitUntil: app().waitUntil,
      })
      length = current.events.length
    })
  } catch (error) {
    if (!isAbort(error)) {
      const failed = errorMessage(error)
      try {
        const story = await loadStory(storyId)
        emit({ type: 'error', error: failed, length: story.events.length })
        return
      } catch {
        emit({ type: 'error', error: failed, length })
        throw error
      }
    }
  }
  const endedAt = Date.now()
  const timing = turnTiming({ ...clock, startedAt, endedAt })
  await saveTiming(storyId, timing)
  emit({ type: 'done', ms: endedAt - startedAt, timing })
}

export type LlmExchange = {
  sent: ChatMessage[]
  received: {
    content?: string
    tool_calls?: { id: string; name: string; arguments: unknown }[]
  }
}

export async function replayEvents(
  events: StoryEvent[],
): Promise<{ events: StoryEvent[]; trace: LlmExchange[] }> {
  const story: Story = {
    id: 'eval',
    title: 'Eval',
    world: 'eval',
    createdAt: '',
    updatedAt: '',
    events: leadCards(structuredClone(events)),
    scenes: [],
    assets: [],
    cards: [],
  }
  reproject(story)
  const start = story.events.length
  const trace: LlmExchange[] = []
  await run(story, {
    dry: true,
    startedAt: Date.now(),
    emit: () => {},
    trace,
    clock: { modelMs: 0, completionTokens: 0, images: [] },
    waitUntil() {},
  })
  return { events: story.events.slice(start), trace }
}

type Clock = {
  firstTokenAt?: number
  modelMs: number
  completionTokens: number
  images: number[]
}

type RunOptions = {
  dry: boolean
  startedAt: number
  emit: (message: TurnMessage) => void
  trace?: LlmExchange[]
  signal?: AbortSignal
  clock: Clock
  waitUntil: (promise: Promise<unknown>) => void
}

type Save = {
  soon: () => void
  now: () => Promise<void>
}

type Live = RunOptions & {
  publish: () => Promise<void>
  note: (at: number, asset: Extract<TurnMessage, { type: 'asset' }>) => void
}

type NotedAsset = { at: number; asset: Extract<TurnMessage, { type: 'asset' }> }

function disk(story: Story): Save {
  let writing = Promise.resolve()
  let timer: ReturnType<typeof setTimeout> | undefined
  const enqueue = () => {
    writing = writing.then(() => persistStory(story))
    return writing
  }
  return {
    soon() {
      if (timer) return
      timer = setTimeout(() => {
        timer = undefined
        void enqueue()
      }, 150)
    },
    now() {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      reproject(story)
      return enqueue()
    },
  }
}

function memorySave(story: Story): Save {
  return {
    soon() {},
    async now() {
      reproject(story)
    },
  }
}

async function run(story: Story, options: RunOptions): Promise<void> {
  const { dry, emit } = options
  const save = dry ? memorySave(story) : disk(story)
  const noted: NotedAsset[] = []
  const emitFrom = (at: number) => {
    for (let index = at; index < story.events.length; index++) {
      const event = story.events[index]
      if (event) emit({ type: 'event', at: index, event })
    }
    for (const item of noted) if (item.at >= at) emit(item.asset)
  }
  const live: Live = {
    ...options,
    publish: () => save.now(),
    note(at, asset) {
      noted.push({ at, asset })
    },
  }
  emit({ type: 'status', phase: 'model' })
  await save.now()
  const messages = llmMessages(story.events, story.title)
  const { signal, clock } = options
  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    if (signal?.aborted) break
    if (loop > 0) emit({ type: 'status', phase: 'model' })
    const sent = options.trace ? structuredClone(messages) : undefined
    const calls: ToolCall[] = []
    const results: { id: string; content: string }[] = []
    let chain = Promise.resolve()
    let draft: OutputEvent | undefined
    let requestTokens = 0
    let stopped = false
    const modelStarted = Date.now()
    try {
      for await (const part of streamCompletion(messages, signal, (tokens) => {
        requestTokens = tokens
      })) {
        if (clock.firstTokenAt === undefined) clock.firstTokenAt = Date.now()
        if (part.type === 'text') {
          const next = `${draft?.text ?? ''}${part.text}`
          if (!next.trim()) continue
          if (!draft) {
            draft = { type: 'output', text: next }
            story.events.push(draft)
          } else {
            draft.text = next
          }
          emitFrom(story.events.indexOf(draft))
          save.soon()
          continue
        }
        const call = part.call
        const name = call.function.name
        const args = parseArgs(call.function.arguments)
        calls.push(call)
        if (name === 'Read') {
          chain = chain.then(async () => {
            await save.now()
            results.push({ id: call.id, content: readSceneLines(story, readRange(args)) })
          })
          continue
        }
        const event = toolEvent(name, args)
        if (!event) {
          chain = chain.then(async () => {
            results.push({ id: call.id, content: `Unknown tool ${name}` })
          })
          continue
        }
        if (
          event.type === 'delete' &&
          !resolvesAt(story.events, event, story.events.length)
        )
          event.error = 'no scenes at those indices'
        story.events.push(event)
        const at = story.events.length - 1
        emitFrom(at)
        save.soon()
        chain = chain.then(async () => {
          const content = await sideEffect(story, event, live, at)
          results.push({ id: call.id, content })
          emitFrom(at)
        })
      }
    } catch (error) {
      if (!isAbort(error)) throw error
      stopped = true
    } finally {
      clock.modelMs += Date.now() - modelStarted
      clock.completionTokens += requestTokens
    }
    await chain
    const spoken = draft?.text.trim() ?? ''
    if (draft && spoken && draft.text !== spoken) {
      draft.text = spoken
      emitFrom(story.events.indexOf(draft))
    }
    if (options.trace && sent) {
      options.trace.push({
        sent,
        received: {
          ...(spoken ? { content: spoken } : {}),
          ...(calls.length > 0 ? { tool_calls: calls.map(plainCall) } : {}),
        },
      })
    }
    if (stopped || signal?.aborted) break
    if (!followUp(calls.map((call) => call.function.name))) break
    messages.push({
      role: 'assistant',
      ...(spoken ? { content: spoken } : {}),
      tool_calls: calls,
    })
    for (const result of results)
      messages.push({ role: 'tool', tool_call_id: result.id, content: result.content })
  }
  await save.now()
}

function phase(
  live: Live,
  kind: Exclude<TurnPhase, 'model'>,
  name: string,
  ms?: number,
): void {
  if (live.dry) return
  live.emit({
    type: 'status',
    phase: kind,
    name,
    ...(ms !== undefined ? { ms } : {}),
  })
}

async function sideEffect(
  story: Story,
  event: StoryEvent,
  live: Live,
  at: number,
): Promise<string> {
  switch (event.type) {
    case 'image':
      return imageEffect(story, event, live, at)
    case 'dialogue':
      return dialogueEffect(story, event, live, at)
    case 'video':
      return videoEffect(story, event, live)
    case 'card':
      await live.publish()
      return event.error ?? ''
    case 'delete':
      await live.publish()
      return (
        event.error ??
        `Deleted. ${project(story.events.slice(0, at + 1)).scenes.length} scenes remain. If the user asked you to replace or continue, write the new scenes now.`
      )
    case 'input':
      return event.text
    case 'output':
      return event.text
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

async function imageEffect(
  story: Story,
  event: ImageEvent,
  live: Live,
  at: number,
): Promise<string> {
  if (!live.dry && !event.error && event.prompt && !live.signal?.aborted) {
    const started = Date.now()
    phase(live, 'image', event.name)
    try {
      await raceAbort(
        generateStoryImage(story, event.name, event.prompt, event.references ?? []),
        live.signal,
      )
      live.note(at, {
        type: 'asset',
        name: event.name,
        kind: 'image',
        url: assetUrl(story.id, event.name, 'image'),
      })
    } catch (error) {
      if (!isAbort(error)) event.error = errorMessage(error)
    }
    live.clock.images.push((Date.now() - started) / 1000)
    phase(live, 'image', event.name, Date.now() - started)
  }
  await live.publish()
  return event.error ?? ''
}

async function dialogueEffect(
  story: Story,
  event: DialogueEvent,
  live: Live,
  at: number,
): Promise<string> {
  const voice = event.speaker
    ? story.cards.find((card) => card.name.toLowerCase() === event.speaker?.toLowerCase())
        ?.voice
    : undefined
  if (
    !live.dry &&
    !live.signal?.aborted &&
    event.speaker &&
    event.caption &&
    voice &&
    resolveVoiceId(voice)
  ) {
    const started = Date.now()
    phase(live, 'voice', event.speaker)
    try {
      const speech = await raceAbort(
        generateStoryVoice(story.id, voice, event.caption),
        live.signal,
      )
      live.note(at, {
        type: 'asset',
        name: event.speaker,
        kind: 'voice',
        url: storyAssetUrl(story.id, speech.key),
      })
    } catch {}
    phase(live, 'voice', event.speaker, Date.now() - started)
  }
  await live.publish()
  return ''
}

async function videoEffect(story: Story, event: VideoEvent, live: Live): Promise<string> {
  if (!live.dry && !event.error && (event.prompt || event.firstFrame)) {
    const storyId = story.id
    const name = event.name
    phase(live, 'video', name)
    live.waitUntil(
      generateStoryVideo(story, name, event.prompt ?? {}, {
        firstFrame: event.firstFrame,
        lastFrame: event.lastFrame,
        duration: event.duration,
      }).catch((error) => {
        const message = errorMessage(error)
        event.error = message
        void changeStory(storyId, (current) => {
          for (let index = current.events.length - 1; index >= 0; index--) {
            const target = current.events[index]
            if (target?.type !== 'video' || target.name !== name) continue
            if (!target.error) target.error = message
            return
          }
        })
      }),
    )
  }
  await live.publish()
  return event.error ?? ''
}

function resolvesAt(events: StoryEvent[], event: DeleteEvent, at: number): boolean {
  const length = project(events.slice(0, at)).scenes.length
  return event.indices.some((index) => {
    const resolved = index < 0 ? length + index : index
    return resolved >= 0 && resolved < length
  })
}

function plainCall(call: ToolCall): {
  id: string
  name: string
  arguments: unknown
} {
  return {
    id: call.id,
    name: call.function.name,
    arguments: parseArgs(call.function.arguments),
  }
}
