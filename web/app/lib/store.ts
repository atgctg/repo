import { useSyncExternalStore } from 'react'
import { historyPreview, leadCards, storyId } from 'shared'
import type {
  Speech,
  Story,
  StoryEvent,
  StorySummary,
  TurnPhase,
  TurnStreamEvent,
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
import { coverUrl, filesFrom, speechFrom, toStory } from './view'

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
}

export type StoryUi = {
  selected: number[]
  anchor?: number
  openScene?: number
  sceneIndex: number
  cards: boolean
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
  worlds: World[]
  sources: Record<string, WorldSource>
  summaries: StorySummary[]
  entries: Record<string, Entry>
  ui: Record<string, StoryUi>
  activity: Record<string, Activity>
  now: number
  version: number
}

const emptyUi: StoryUi = { selected: [], sceneIndex: 0, cards: false }

const serverSnapshot: Snapshot = {
  worlds: [],
  sources: {},
  summaries: [],
  entries: {},
  ui: {},
  activity: {},
  now: 0,
  version: 0,
}

let snapshot: Snapshot = { ...serverSnapshot }
const listeners = new Set<() => void>()
let clock: ReturnType<typeof setInterval> | undefined
const forks = new Map<string, Promise<void>>()
const storyLoads = new Map<string, Promise<void>>()
const worldLoads = new Map<string, Promise<void>>()
let indexLoad: Promise<void> | undefined

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

function save(entry: Entry, cover?: string): void {
  const prev = snapshot.summaries.find((item) => item.id === entry.id)
  const summaries = [
    summaryFor(entry, cover ?? prev?.cover, prev?.case),
    ...snapshot.summaries.filter((item) => item.id !== entry.id),
  ]
  commit({
    ...snapshot,
    entries: { ...snapshot.entries, [entry.id]: entry },
    summaries,
  })
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot(): Snapshot {
  return snapshot
}

export function getServerSnapshot(): Snapshot {
  return serverSnapshot
}

function useSnap(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function hasEntry(id: string): boolean {
  return Boolean(snapshot.entries[id])
}

export function useWorlds(): World[] {
  return useSnap().worlds
}

export function useStoryList(): StorySummary[] {
  return useSnap().summaries
}

export function useNow(): number {
  return useSnap().now
}

export function useStory(id: string): Story | undefined {
  const snap = useSnap()
  const entry = snap.entries[id]
  if (!entry) return undefined
  return toStory(entry, snap)
}

export function useStoryUi(id: string): StoryUi {
  return useSnap().ui[id] ?? emptyUi
}

export function useActivity(id: string): Activity {
  return useSnap().activity[id] ?? {}
}

export function setWorlds(worlds: World[]): void {
  commit({ ...snapshot, worlds })
}

export function setSummaries(incoming: StorySummary[]): void {
  const ids = new Set(incoming.map((item) => item.id))
  const local = snapshot.summaries.filter(
    (item) => snapshot.entries[item.id] && !ids.has(item.id),
  )
  commit({ ...snapshot, summaries: [...local, ...incoming] })
}

export function ingest(story: Story): void {
  const prev = snapshot.entries[story.id]
  const entry: Entry = {
    id: story.id,
    world: story.world || prev?.world || '',
    title: story.title || prev?.title || story.id,
    createdAt: story.createdAt || prev?.createdAt || new Date().toISOString(),
    updatedAt: story.updatedAt || new Date().toISOString(),
    events: story.events,
    files: filesFrom(story),
    speech: speechFrom(story),
  }
  const projected = toStory(entry, snapshot)
  save(entry, coverUrl(projected))
}

export function ensureWorld(id: string): Promise<void> {
  if (snapshot.sources[id]) return Promise.resolve()
  const existing = worldLoads.get(id)
  if (existing) return existing
  const task = fetchWorld(id)
    .then((source) => {
      if (!source) return
      commit({ ...snapshot, sources: { ...snapshot.sources, [id]: source } })
    })
    .finally(() => {
      worldLoads.delete(id)
    })
  worldLoads.set(id, task)
  return task
}

export function ensureStory(id: string): Promise<void> {
  if (snapshot.entries[id]) return Promise.resolve()
  const existing = storyLoads.get(id)
  if (existing) return existing
  const task = fetchStory(id)
    .then((story) => {
      if (story) ingest(story)
    })
    .finally(() => {
      storyLoads.delete(id)
    })
  storyLoads.set(id, task)
  return task
}

export function ensureIndex(): Promise<void> {
  if (
    snapshot.worlds.length > 0 &&
    snapshot.worlds.every((world) => snapshot.sources[world.id])
  ) {
    return Promise.resolve()
  }
  if (indexLoad) return indexLoad
  indexLoad = Promise.all([fetchWorlds(), fetchStories()])
    .then(async ([worlds, stories]) => {
      setWorlds(worlds)
      setSummaries(stories)
      await Promise.all(worlds.map((world) => ensureWorld(world.id)))
    })
    .finally(() => {
      indexLoad = undefined
    })
  return indexLoad
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function unusedStoryId(worldId: string): string {
  const taken = new Set([
    ...snapshot.summaries.map((item) => item.id),
    ...Object.keys(snapshot.entries),
  ])
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = storyId(worldId)
    if (!taken.has(id)) return id
  }
  return storyId(worldId)
}

export function forkWorld(worldId: string): string | undefined {
  const source = snapshot.sources[worldId]
  if (!source) return undefined
  const id = unusedStoryId(worldId)
  const now = new Date().toISOString()
  const entry: Entry = {
    id,
    world: worldId,
    title: source.title,
    createdAt: now,
    updatedAt: now,
    events: leadCards(structuredClone(source.events)),
    files: [],
    speech: [],
  }
  save(entry, source.cover)
  const task = postFork(worldId, id)
    .then((story) => {
      ingest(story)
    })
    .catch((error: unknown) => {
      patchActivity(id, (current) => ({
        ...current,
        turnStartedAt: undefined,
        phase: undefined,
        phaseStartedAt: undefined,
        phaseMs: undefined,
        imageName: undefined,
        error: messageOf(error),
      }))
      throw error
    })
  forks.set(id, task)
  void task.finally(() => {
    forks.delete(id)
  })
  return id
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

function applyStream(id: string, event: TurnStreamEvent): void {
  switch (event.event) {
    case 'story':
      ingest(event.data)
      return
    case 'status': {
      const status = event.data
      patchActivity(id, (current) => ({
        ...current,
        turnStartedAt: status.startedAt,
        phase: status.phase,
        phaseStartedAt:
          status.phase === 'model'
            ? undefined
            : (status.phaseStartedAt ??
              (status.ms === undefined ? Date.now() : current.phaseStartedAt)),
        phaseMs: status.ms,
        imageName:
          status.ms !== undefined ? undefined : (status.name ?? current.imageName),
        error: undefined,
      }))
      return
    }
    case 'done':
      patchActivity(id, () => ({}))
      return
    case 'error':
      patchActivity(id, () => ({ error: event.data.error }))
      return
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

export async function sendTurn(id: string, text: string, at?: number): Promise<boolean> {
  if (snapshot.activity[id]?.turnStartedAt) return false
  const entry = snapshot.entries[id]
  if (!entry) return false
  const previous = entry.events
  patchActivity(id, () => ({ turnStartedAt: Date.now(), phase: 'model' }))
  const ready = await waitForFork(id)
  if (!ready) return false
  const current = snapshot.entries[id]
  if (!current) return false
  const events =
    typeof at === 'number'
      ? previous
          .map((item, index) =>
            index === at && item.type === 'message' ? { ...item, text } : item,
          )
          .slice(0, at + 1)
      : [...current.events, { type: 'message' as const, user: 'user', text }]
  save({ ...current, events, updatedAt: new Date().toISOString() })
  let sawStory = false
  try {
    await streamTurn(id, text, at, (streamEvent) => {
      if (streamEvent.event === 'story') sawStory = true
      applyStream(id, streamEvent)
    })
    const activity = snapshot.activity[id]
    if (activity?.turnStartedAt && !activity.error) patchActivity(id, () => ({}))
    return true
  } catch (error) {
    if (!sawStory) {
      const local = snapshot.entries[id]
      if (local) save({ ...local, events: previous })
    }
    patchActivity(id, () => ({ error: messageOf(error) }))
    return false
  }
}

export async function generateAsset(
  id: string,
  name: string,
  type: 'image' | 'video',
): Promise<void> {
  if (snapshot.activity[id]?.imageName) return
  patchActivity(id, (current) => ({
    ...current,
    phase: type,
    phaseStartedAt: Date.now(),
    phaseMs: undefined,
    imageName: name,
    error: undefined,
  }))
  try {
    const story = await postGenerate(id, name, type)
    if (story) ingest(story)
    else {
      const loaded = await fetchStory(id)
      if (loaded) ingest(loaded)
    }
    commit({ ...snapshot, version: snapshot.version + 1 })
    patchActivity(id, (current) => {
      if (current.turnStartedAt) {
        return { ...current, imageName: undefined }
      }
      return {}
    })
  } catch (error) {
    patchActivity(id, (current) => ({
      ...(current.turnStartedAt
        ? { turnStartedAt: current.turnStartedAt, phase: current.phase }
        : {}),
      error: messageOf(error),
    }))
  }
}

export function selectScene(id: string, index: number, range: boolean): void {
  const ui = uiOf(id)
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

export function closeDrawer(id: string): void {
  const ui = uiOf(id)
  commit({
    ...snapshot,
    ui: { ...snapshot.ui, [id]: { ...ui, openScene: undefined } },
  })
}

export function toggleCards(id: string): void {
  const ui = uiOf(id)
  commit({
    ...snapshot,
    ui: {
      ...snapshot.ui,
      [id]: { ...ui, cards: !ui.cards, openScene: undefined },
    },
  })
}

export type { Snapshot }
