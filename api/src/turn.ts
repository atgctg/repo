import {
  leadCards,
  normalizeRecord,
  project,
  type CardEvent,
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
import { assetUrl, storyAssetUrl } from './files'
import {
  errorMessage,
  generateStoryImage,
  generateStoryVideo,
  generateStoryVoice,
  resolveVoiceId,
} from './media'
import { eventsToMessages, type ChatMessage, type ToolCall } from './messages'
import { finishTools, noteToolDelta, type OpenTool, type ToolDelta } from './stream'
import {
  changeStory,
  loadStory,
  persistStory,
  readSceneLines,
  refresh,
  saveTiming,
} from './stories'
import { STORY_TOOLS } from './tools'

const MODEL = 'accounts/fireworks/models/deepseek-v4p1-flash'
const MAX_LOOPS = 6

export function followUp(toolNames: string[]): boolean {
  if (toolNames.length === 0) return false
  if (toolNames.includes('Read')) return true
  return toolNames.every((name) => name === 'Delete')
}

const systemPrompt = await Bun.file(`${import.meta.dir}/../prompt.md`).text()

export function llmMessages(events: StoryEvent[], title: string): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt },
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
      if (result.ok) resolve(result.value)
      else reject(result.error)
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
): Promise<Story> {
  const startedAt = Date.now()
  const clock: Clock = { modelMs: 0, completionTokens: 0, images: [] }
  let length = 0
  try {
    const story = await changeStory(storyId, async (current) => {
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
      await run(current, { dry: false, startedAt, emit, signal, clock })
      length = current.events.length
      return current
    })
    const endedAt = Date.now()
    const timing = turnTiming({ ...clock, startedAt, endedAt })
    await saveTiming(storyId, timing)
    emit({ type: 'done', ms: endedAt - startedAt, timing })
    return story
  } catch (error) {
    if (isAbort(error)) {
      const endedAt = Date.now()
      const timing = turnTiming({ ...clock, startedAt, endedAt })
      await saveTiming(storyId, timing)
      emit({ type: 'done', ms: endedAt - startedAt, timing })
      return loadStory(storyId)
    }
    const failed = errorMessage(error)
    try {
      const story = await loadStory(storyId)
      emit({ type: 'error', error: failed, length: story.events.length })
      return story
    } catch {
      emit({ type: 'error', error: failed, length })
      throw error
    }
  }
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
  await refresh(story)
  const start = story.events.length
  const trace: LlmExchange[] = []
  await run(story, {
    dry: true,
    startedAt: Date.now(),
    emit: () => {},
    trace,
    clock: { modelMs: 0, completionTokens: 0, images: [] },
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
}

type Save = {
  soon: () => void
  now: (project: boolean) => Promise<void>
}

type Live = RunOptions & {
  publish: () => Promise<void>
  note: (at: number, asset: Extract<TurnMessage, { type: 'asset' }>) => void
}

type NotedAsset = { at: number; asset: Extract<TurnMessage, { type: 'asset' }> }

function disk(story: Story): Save {
  let writing = Promise.resolve()
  let timer: ReturnType<typeof setTimeout> | undefined
  const enqueue = (project: boolean) => {
    writing = writing.then(async () => {
      if (project) await refresh(story)
      await persistStory(story)
    })
    return writing
  }
  return {
    soon() {
      if (timer) return
      timer = setTimeout(() => {
        timer = undefined
        void enqueue(false)
      }, 150)
    },
    now(project: boolean) {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      return enqueue(project)
    },
  }
}

function memorySave(story: Story): Save {
  return {
    soon() {},
    now(project: boolean) {
      return project ? refresh(story) : Promise.resolve()
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
    publish: () => save.now(true),
    note(at, asset) {
      noted.push({ at, asset })
    },
  }
  emit({ type: 'status', phase: 'model' })
  await save.now(true)
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
            await save.now(true)
            results.push({ id: call.id, content: readSceneLines(story, numbers(args)) })
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
  await save.now(true)
}

function toolEvent(name: string, args: Record<string, unknown>): StoryEvent | undefined {
  switch (name) {
    case 'Image':
      return imageEvent(args)
    case 'Dialogue':
      return dialogueEvent(args)
    case 'Video':
      return videoEvent(args)
    case 'Card':
      return cardEvent(args)
    case 'Delete':
      return deleteEvent(args)
    default:
      return undefined
  }
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
      if (!isAbort(error)) {
        event.error = errorMessage(error)
        console.error('img gen error', {
          storyId: story.id,
          name: event.name,
          error: event.error,
        })
      }
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
    } catch (error) {
      if (!isAbort(error))
        console.error('voice skip', { storyId: story.id, error: errorMessage(error) })
    }
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
    void generateStoryVideo(story, name, event.prompt ?? {}, {
      firstFrame: event.firstFrame,
      lastFrame: event.lastFrame,
      duration: event.duration,
    }).catch((error) => {
      const message = errorMessage(error)
      console.error('video gen error', { storyId, name, error: message })
      event.error = message
      void changeStory(storyId, (current) => {
        for (let index = current.events.length - 1; index >= 0; index--) {
          const target = current.events[index]
          if (target?.type !== 'video' || target.name !== name) continue
          if (!target.error) target.error = message
          return
        }
      })
    })
  }
  await live.publish()
  return event.error ?? ''
}

function imageEvent(args: Record<string, unknown>): ImageEvent {
  const name = string(args.name)
  const prompt = args.prompt === undefined ? undefined : normalizeRecord(args.prompt)
  const references = names(args.references)
  const event: ImageEvent = {
    type: 'image',
    name: name || 'Image',
    ...(prompt && Object.keys(prompt).length > 0 ? { prompt } : {}),
    ...(references.length > 0 ? { references } : {}),
    ...placement(args),
  }
  if (!name) event.error = 'name is required'
  else if (!event.prompt) event.error = `No prompt for image "${name}"`
  return event
}

function dialogueEvent(args: Record<string, unknown>): DialogueEvent {
  const speaker = string(args.speaker)
  const caption = string(args.caption)
  return {
    type: 'dialogue',
    background: string(args.background),
    ...(speaker ? { speaker } : {}),
    ...(caption ? { caption } : {}),
    ...placement(args),
  }
}

function videoEvent(args: Record<string, unknown>): VideoEvent {
  const name = string(args.name)
  const prompt = args.prompt === undefined ? undefined : normalizeRecord(args.prompt)
  const firstFrame = string(args.firstFrame)
  const lastFrame = string(args.lastFrame)
  const duration = number(args.duration)
  const event: VideoEvent = {
    type: 'video',
    name: name || 'Video',
    ...(prompt && Object.keys(prompt).length > 0 ? { prompt } : {}),
    ...(firstFrame ? { firstFrame } : {}),
    ...(lastFrame ? { lastFrame } : {}),
    ...(duration ? { duration } : {}),
    ...placement(args),
  }
  if (!name) event.error = 'name is required'
  else if (!event.prompt && !event.firstFrame)
    event.error = `No prompt for video "${name}"`
  return event
}

function cardEvent(args: Record<string, unknown>): CardEvent {
  const name = string(args.name)
  const attributes =
    args.attributes === undefined ? undefined : normalizeRecord(args.attributes)
  const event: CardEvent = {
    type: 'card',
    name: name || 'Card',
    ...(args.cover === null || typeof args.cover === 'string'
      ? { cover: args.cover }
      : {}),
    ...(args.voice === null || typeof args.voice === 'string'
      ? { voice: args.voice }
      : {}),
    ...(attributes ? { attributes } : {}),
  }
  if (!name) event.error = 'name is required'
  return event
}

function deleteEvent(args: Record<string, unknown>): DeleteEvent {
  const indices = Array.isArray(args.indices)
    ? args.indices.filter((index): index is number => typeof index === 'number')
    : typeof args.indices === 'number'
      ? [args.indices]
      : typeof args.index === 'number'
        ? [args.index]
        : []
  return { type: 'delete', indices }
}

function resolvesAt(events: StoryEvent[], event: DeleteEvent, at: number): boolean {
  const length = project(events.slice(0, at)).scenes.length
  return event.indices.some((index) => {
    const resolved = index < 0 ? length + index : index
    return resolved >= 0 && resolved < length
  })
}

type StreamPart = { type: 'text'; text: string } | { type: 'tool'; call: ToolCall }

async function* streamCompletion(
  messages: ChatMessage[],
  signal: AbortSignal | undefined,
  onUsage: (tokens: number) => void,
): AsyncGenerator<StreamPart> {
  const apiKey = Bun.env.FIREWORKS_API_KEY?.trim()
  if (!apiKey) throw new Error('FIREWORKS_API_KEY is required')
  const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: STORY_TOOLS,
      tool_choice: 'auto',
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal,
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Fireworks error: ${body.slice(0, 500)}`)
  }
  if (!response.body) throw new Error('Fireworks returned no stream')

  const calls: OpenTool[] = []
  for await (const data of sseData(response.body)) {
    if (data === '[DONE]') break
    let parsed: {
      choices?: Array<{
        delta?: { content?: string | null; tool_calls?: ToolDelta[] | null }
      }>
    }
    try {
      parsed = JSON.parse(data) as typeof parsed
    } catch {
      continue
    }
    const tokens = completionTokens(parsed)
    if (tokens !== undefined) onUsage(tokens)
    const delta = parsed.choices?.[0]?.delta
    if (!delta) continue
    if (typeof delta.content === 'string' && delta.content)
      yield { type: 'text', text: delta.content }
    for (const tool of delta.tool_calls ?? []) {
      for (const call of noteToolDelta(calls, tool)) yield { type: 'tool', call }
    }
  }
  for (const call of finishTools(calls)) yield { type: 'tool', call }
}

async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    buf += decoder.decode(value, { stream: !done })
    const parts = buf.split('\n\n')
    buf = done ? '' : (parts.pop() ?? '')
    for (const part of parts) {
      const data = part
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('')
      if (data) yield data
    }
    if (done) break
  }
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

function completionTokens(value: unknown): number | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const usage = (value as { usage?: unknown }).usage
  if (usage === null || typeof usage !== 'object') return undefined
  const record = usage as Record<string, unknown>
  const tokens = record.completion_tokens ?? record.output_tokens
  return typeof tokens === 'number' && Number.isFinite(tokens) ? tokens : undefined
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}
}

function placement(args: Record<string, unknown>): { index?: number; replace?: boolean } {
  const index = number(args.index)
  return {
    ...(index !== undefined ? { index } : {}),
    ...(args.replace === true ? { replace: true } : {}),
  }
}

function numbers(args: Record<string, unknown>): {
  offset?: number
  limit?: number
  last?: number
} {
  return {
    offset: number(args.offset),
    limit: number(args.limit),
    last: number(args.last),
  }
}

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

function names(value: unknown): string[] {
  const list =
    typeof value === 'string'
      ? [value]
      : Array.isArray(value)
        ? value.map((item) => String(item))
        : []
  return list
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5)
}
