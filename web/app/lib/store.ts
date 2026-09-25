import { useSyncExternalStore } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { coverUrl, historyPreview, leadCards, storyId } from 'shared'
import type {
  Speech,
  Story,
  StoryEvent,
  StorySummary,
  TurnMessage,
  TurnPhase,
  TurnTiming,
  World,
  WorldSource,
} from 'shared'
import {
  fetchStories,
  fetchStory,
  fetchWorld,
  fetchWorlds,
  postFork,
  postGenerate,
  streamTurn,
} from './api'
import { queryClient, storiesKey, storyKey, worldKey, worldsKey } from './query'
import { filesFrom, speechFrom, toStory } from './view'

export type AssetFile = {
  name: string
  url?: string
  width?: number
  height?: number
  dominantColor?: string
}

export type SpeechMark = { event: number; speech: Speech }

export type Entry = {
  id: string
  world: string
  title: string
  createdAt: string
  updatedAt: string
  events: StoryEvent[]
  files: AssetFile[]
  speech: SpeechMark[]
  timing?: TurnTiming
}

type StoryCache = {
  entry: Entry
  version: number
}

export type StoryUi = {
  selected: number[]
  anchor?: number
  openScene?: number
  sceneIndex: number
}

export type Activity = {
  turnStartedAt?: number
  phase?: TurnPhase
  phaseStartedAt?: number
  phaseMs?: number
  imageName?: string
  error?: string
}

type Snapshot = {
  ui: Record<string, StoryUi>
  activity: Record<string, Activity>
  now: number
}

const emptyUi: StoryUi = { selected: [], sceneIndex: 0 }

const serverSnapshot: Snapshot = {
  ui: {},
  activity: {},
  now: 0,
}

let snapshot: Snapshot = { ...serverSnapshot }
const listeners = new Set<() => void>()
let clock: ReturnType<typeof setInterval> | undefined
const forks = new Map<string, Promise<void>>()
const turns = new Map<string, AbortController>()

function syncClock(): void {
  const active = Object.values(snapshot.activity).some(
    (item) =>
      item.turnStartedAt ||
      (item.phaseStartedAt !== undefined && item.phaseMs === undefined),
  )
  if (active && !clock) {
    clock = setInterval(() => {
      snapshot = { ...snapshot, now: Date.now() }
      for (const listener of listeners) listener()
    }, 200)
  }
  if (!active && clock) {
    clearInterval(clock)
    clock = undefined
  }
}

function commit(next: Snapshot): void {
  snapshot = next
  syncClock()
  for (const listener of listeners) listener()
}

function uiOf(id: string): StoryUi {
  return snapshot.ui[id] ?? emptyUi
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): Snapshot {
  return snapshot
}

function useSnap(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot)
}

function readCache(id: string): StoryCache | undefined {
  const cache = queryClient.getQueryData<StoryCache | null>(storyKey(id))
  return cache ?? undefined
}

function summaryFor(entry: Entry, cover?: string, caseName?: string): StorySummary {
  return {
    id: entry.id,
    world: entry.world,
    title: entry.title,
    updatedAt: entry.updatedAt,
    preview: historyPreview(entry.events),
    ...(cover ? { cover } : {}),
    ...(caseName ? { case: caseName } : {}),
  }
}

function publishEntry(entry: Entry, cover?: string, version?: number): void {
  const prev = readCache(entry.id)
  const nextVersion = version ?? prev?.version ?? 0
  queryClient.setQueryData<StoryCache>(storyKey(entry.id), {
    entry,
    version: nextVersion,
  })
  queryClient.setQueryData<StorySummary[]>(storiesKey, (list) => {
    const previous = list?.find((item) => item.id === entry.id)
    const nextCover = cover ?? coverUrl(toStory(entry, nextVersion)) ?? previous?.cover
    const summary = summaryFor(entry, nextCover, previous?.case)
    return [summary, ...(list ?? []).filter((item) => item.id !== entry.id)]
  })
}

function entryFrom(story: Story, prev?: Entry): Entry {
  return {
    id: story.id,
    world: story.world || prev?.world || '',
    title: story.title || prev?.title || story.id,
    createdAt: story.createdAt || prev?.createdAt || new Date().toISOString(),
    updatedAt: story.updatedAt || new Date().toISOString(),
    events: story.events,
    files: filesFrom(story),
    speech: speechFrom(story),
    ...(story.timing ? { timing: story.timing } : {}),
  }
}

function publishStory(story: Story, version?: number): void {
  publishEntry(entryFrom(story, readCache(story.id)?.entry), undefined, version)
}

async function fetchStoryCache(id: string): Promise<StoryCache | null> {
  const story = await fetchStory(id)
  if (!story) return null
  return { entry: entryFrom(story), version: 0 }
}

export function useWorlds(): World[] {
  const { data } = useQuery({ queryKey: worldsKey, queryFn: fetchWorlds })
  return data ?? []
}

export function useStoryList(): StorySummary[] {
  const { data } = useQuery({ queryKey: storiesKey, queryFn: fetchStories })
  return data ?? []
}

export function useNow(): number {
  return useSnap().now
}

export function useStory(id: string): Story | undefined {
  const { data } = useQuery({
    queryKey: storyKey(id),
    queryFn: () => fetchStoryCache(id),
    enabled: id.length > 0,
  })
  if (!data) return undefined
  return toStory(data.entry, data.version)
}

export function useStoryUi(id: string): StoryUi {
  return useSnap().ui[id] ?? emptyUi
}

export function useActivity(id: string): Activity {
  return useSnap().activity[id] ?? {}
}

export function ensureStory(id: string): Promise<StoryCache | null> {
  return queryClient.ensureQueryData({
    queryKey: storyKey(id),
    queryFn: () => fetchStoryCache(id),
  })
}

export async function ensureIndex(): Promise<void> {
  const [worlds] = await Promise.all([
    queryClient.ensureQueryData({ queryKey: worldsKey, queryFn: fetchWorlds }),
    queryClient.ensureQueryData({ queryKey: storiesKey, queryFn: fetchStories }),
  ])
  for (const world of worlds) {
    void queryClient.prefetchQuery({
      queryKey: worldKey(world.id),
      queryFn: async () => (await fetchWorld(world.id)) ?? null,
    })
  }
}

export function prefetchIndex(): void {
  void ensureIndex().catch(() => undefined)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function unusedStoryId(worldId: string): string {
  const summaries = queryClient.getQueryData<StorySummary[]>(storiesKey) ?? []
  const taken = new Set(summaries.map((item) => item.id))
  for (const [, cache] of queryClient.getQueriesData<StoryCache | null>({
    queryKey: ['story'],
  })) {
    if (cache) taken.add(cache.entry.id)
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = storyId(worldId)
    if (!taken.has(id)) return id
  }
  return storyId(worldId)
}

export function useForkWorld(): (worldId: string) => string | undefined {
  const mutation = useMutation({
    mutationFn: ({ worldId, id }: { worldId: string; id: string }) =>
      postFork(worldId, id),
    onSuccess: (story) => {
      publishStory(story)
    },
    onError: (error, { id }) => {
      patchActivity(id, () => ({ error: messageOf(error) }))
    },
  })
  return (worldId) => {
    const source = queryClient.getQueryData<WorldSource | null>(worldKey(worldId))
    const world = queryClient
      .getQueryData<World[]>(worldsKey)
      ?.find((item) => item.id === worldId)
    const title = source?.title ?? world?.title
    if (!title) return undefined
    const id = unusedStoryId(worldId)
    const now = new Date().toISOString()
    const entry: Entry = {
      id,
      world: worldId,
      title,
      createdAt: now,
      updatedAt: now,
      events: source ? leadCards(structuredClone(source.events)) : [],
      files: [],
      speech: [],
    }
    publishEntry(entry, source?.cover ?? world?.cover)
    const task = mutation.mutateAsync({ worldId, id }).then(() => undefined)
    forks.set(id, task)
    void task.catch(() => undefined)
    void task.finally(() => {
      forks.delete(id)
    })
    return id
  }
}

async function waitForFork(id: string): Promise<boolean> {
  const pending = forks.get(id)
  if (!pending) return true
  try {
    await pending
    return true
  } catch {
    return false
  }
}

function patchActivity(id: string, recipe: (current: Activity) => Activity): void {
  commit({
    ...snapshot,
    now: Date.now(),
    activity: { ...snapshot.activity, [id]: recipe(snapshot.activity[id] ?? {}) },
  })
}

function withEvents(entry: Entry, events: StoryEvent[]): Entry {
  return {
    ...entry,
    events,
    speech: entry.speech.filter((mark) => mark.event < events.length),
    updatedAt: new Date().toISOString(),
  }
}

function applyTurn(id: string, message: TurnMessage): void {
  const entry = readCache(id)?.entry
  if (!entry && message.type !== 'status' && message.type !== 'done') return
  switch (message.type) {
    case 'start': {
      if (!entry) return
      publishEntry(withEvents(entry, entry.events.slice(0, message.keep)))
      return
    }
    case 'event': {
      if (!entry) return
      const events = entry.events.slice(0, message.at)
      events.push(message.event)
      const speech = entry.speech.filter((mark) => {
        if (mark.event < message.at) return true
        return mark.event === message.at && message.event.type === 'dialogue'
      })
      publishEntry({
        ...entry,
        events,
        speech,
        updatedAt: new Date().toISOString(),
      })
      return
    }
    case 'status':
      patchActivity(id, (current) => ({
        ...current,
        phase: message.phase,
        phaseStartedAt:
          message.phase === 'model'
            ? undefined
            : message.ms !== undefined
              ? current.phaseStartedAt
              : current.phase === message.phase && current.phaseStartedAt
                ? current.phaseStartedAt
                : Date.now(),
        phaseMs: message.ms,
        imageName:
          message.ms !== undefined ? undefined : (message.name ?? current.imageName),
        error: undefined,
      }))
      return
    case 'asset': {
      if (!entry) return
      if (message.kind === 'voice') {
        const key = decodeURIComponent(message.url.split('?')[0]?.split('/').pop() ?? '')
        if (!key) return
        let at = -1
        for (let index = 0; index < entry.events.length; index++) {
          const event = entry.events[index]
          if (event?.type !== 'dialogue' || event.speaker !== message.name) continue
          if (entry.speech.some((mark) => mark.event === index)) continue
          at = index
          break
        }
        if (at < 0) return
        publishEntry({
          ...entry,
          speech: [...entry.speech, { event: at, speech: { key } }],
        })
        return
      }
      const files = entry.files.filter(
        (file) => file.name.toLowerCase() !== message.name.toLowerCase(),
      )
      files.push({ name: message.name, url: message.url })
      publishEntry({ ...entry, files }, undefined, (readCache(id)?.version ?? 0) + 1)
      return
    }
    case 'done':
      if (entry && message.timing) publishEntry({ ...entry, timing: message.timing })
      patchActivity(id, () => ({}))
      return
    case 'error': {
      if (!entry) return
      publishEntry(withEvents(entry, entry.events.slice(0, message.length)))
      patchActivity(id, () => ({ error: message.error }))
      return
    }
    default: {
      const _exhaustive: never = message
      return _exhaustive
    }
  }
}

export async function sendTurn(
  id: string,
  text: string,
  at?: number,
  selected?: number[],
): Promise<boolean> {
  if (snapshot.activity[id]?.turnStartedAt) return false
  const entry = readCache(id)?.entry
  if (!entry) return false
  const previous = entry.events
  patchActivity(id, () => ({ turnStartedAt: Date.now(), phase: 'model' }))
  const ready = await waitForFork(id)
  if (!ready) {
    patchActivity(id, () => ({}))
    return false
  }
  const current = readCache(id)?.entry
  if (!current) {
    patchActivity(id, () => ({}))
    return false
  }
  const events =
    typeof at === 'number'
      ? previous
          .map((item, index) =>
            index === at && item.type === 'input' ? { ...item, text } : item,
          )
          .slice(0, at + 1)
      : [
          ...current.events,
          {
            type: 'input' as const,
            text,
            ...(selected && selected.length > 0 ? { selected } : {}),
          },
        ]
  publishEntry({ ...current, events, updatedAt: new Date().toISOString() })
  const controller = new AbortController()
  turns.set(id, controller)
  try {
    await streamTurn(
      id,
      text,
      at,
      selected,
      (message) => applyTurn(id, message),
      controller.signal,
    )
    const activity = snapshot.activity[id]
    if (activity?.turnStartedAt && !activity.error) patchActivity(id, () => ({}))
    return true
  } catch (error) {
    if (controller.signal.aborted) {
      patchActivity(id, () => ({}))
      return true
    }
    patchActivity(id, () => ({ error: messageOf(error) }))
    return false
  } finally {
    turns.delete(id)
  }
}

export function stopTurn(id: string): void {
  turns.get(id)?.abort()
}

export function useGenerateAsset(): (
  id: string,
  name: string,
  type: 'image' | 'video',
) => void {
  const mutation = useMutation({
    mutationFn: async ({
      id,
      name,
      type,
    }: {
      id: string
      name: string
      type: 'image' | 'video'
    }) => {
      const story = await postGenerate(id, name, type)
      if (story) return story
      const loaded = await fetchStory(id)
      if (!loaded) throw new Error('Generate failed')
      return loaded
    },
    onMutate: ({ id, name, type }) => {
      patchActivity(id, (current) => ({
        ...current,
        phase: type,
        phaseStartedAt: Date.now(),
        phaseMs: undefined,
        imageName: name,
        error: undefined,
      }))
    },
    onSuccess: (story) => {
      publishStory(story, (readCache(story.id)?.version ?? 0) + 1)
      patchActivity(story.id, (current) => {
        if (current.turnStartedAt) return { ...current, imageName: undefined }
        return {}
      })
    },
    onError: (error, { id }) => {
      patchActivity(id, (current) => ({
        ...(current.turnStartedAt
          ? { turnStartedAt: current.turnStartedAt, phase: current.phase }
          : {}),
        error: messageOf(error),
      }))
    },
  })
  return (id, name, type) => {
    if (snapshot.activity[id]?.imageName) return
    mutation.mutate({ id, name, type })
  }
}

export function selectScenes(id: string, indices: number[]): void {
  const ui = uiOf(id)
  const first = indices[0]
  commit({
    ...snapshot,
    ui: {
      ...snapshot.ui,
      [id]: {
        ...ui,
        selected: indices,
        anchor: first,
        openScene: undefined,
        sceneIndex: first ?? ui.sceneIndex,
      },
    },
  })
}

export function selectScene(id: string, index: number, range: boolean): void {
  const ui = uiOf(id)
  if (!range && ui.selected.includes(index)) {
    const selected = ui.selected.filter((item) => item !== index)
    const anchor = selected.includes(ui.anchor ?? -1) ? ui.anchor : selected.at(-1)
    const openScene = ui.openScene === index ? selected.at(-1) : ui.openScene
    commit({
      ...snapshot,
      ui: {
        ...snapshot.ui,
        [id]: {
          ...ui,
          selected,
          anchor,
          openScene,
          sceneIndex: openScene ?? ui.sceneIndex,
        },
      },
    })
    return
  }
  let selected: number[]
  let anchor = ui.anchor
  if (range && anchor !== undefined) {
    const start = Math.min(anchor, index)
    const end = Math.max(anchor, index)
    selected = []
    for (let cursor = start; cursor <= end; cursor++) selected.push(cursor)
  } else {
    selected = [index]
    anchor = index
  }
  commit({
    ...snapshot,
    ui: {
      ...snapshot.ui,
      [id]: { ...ui, selected, anchor, openScene: index, sceneIndex: index },
    },
  })
}

export function clearSelection(id: string): void {
  const ui = uiOf(id)
  commit({
    ...snapshot,
    ui: {
      ...snapshot.ui,
      [id]: { ...ui, selected: [], anchor: undefined, openScene: undefined },
    },
  })
}

export function closeDrawer(id: string): void {
  const ui = uiOf(id)
  commit({
    ...snapshot,
    ui: { ...snapshot.ui, [id]: { ...ui, openScene: undefined } },
  })
}
