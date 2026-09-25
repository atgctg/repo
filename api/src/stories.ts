import {
  historyPreview,
  leadCards,
  project,
  storyId,
  type Asset,
  type Scene,
  type Story,
  type StoryEvent,
  type StorySummary,
  type TurnTiming,
  isTurnTiming,
} from 'shared'
import { desc, eq } from 'drizzle-orm'
import { database } from './db'
import { parseEvents } from './events'
import { stories as storyTable } from './schema'
import { listAssetKeys, pickAssetKey, storyAssetKeys } from './assets'
import { app } from './context'
import { assetFileName, assetUrl, speechFileName } from './files'
import { generateStoryImage, generateStoryVideo } from './media'
import { formatScene } from './scene-text'
import { findWorld } from './worlds'

const storyWrites = new Map<string, Promise<void>>()

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/

export class StoryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function refresh(story: Story): Promise<void> {
  applyProjection(story, await storyAssetKeys(app().assets, story.id, story.world))
}

function applyProjection(story: Story, keys: Set<string>): void {
  const next = project(story.events)
  story.scenes = next.scenes
  story.cards = next.cards
  story.assets = next.assets
  attachFiles(story, keys)
}

export function changeStory<T>(
  storyId: string,
  fn: (story: Story) => T | Promise<T>,
): Promise<T> {
  const previous = storyWrites.get(storyId) ?? Promise.resolve()
  const next = previous.then(async () => {
    const story = await loadStory(storyId)
    const result = await fn(story)
    await refresh(story)
    await persistStory(story)
    return result
  })
  storyWrites.set(
    storyId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  )
  return next
}

type StoryRow = typeof storyTable.$inferSelect

type NewStory = Omit<typeof storyTable.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>

export async function forkWorld(worldId: string, requestedId?: string): Promise<Story> {
  const world = await findWorld(worldId)
  if (!world) throw new StoryError('World not found', 404)
  const story = { world: world.id, title: world.title, events: leadCards(world.events) }
  if (requestedId === undefined) return hydrate(await insertStory(world.id, story))
  const id = requestedId.trim()
  if (!ID_PATTERN.test(id)) throw new StoryError('id is invalid', 400)
  const row = (await insertRow(id, story)) ?? (await rowById(id))
  if (row?.world !== world.id) throw new StoryError('id is in use', 409)
  return hydrate(row)
}

export async function saveEvalStory(
  caseName: string,
  world: string,
  events: StoryEvent[],
): Promise<string> {
  const row = await insertStory(caseName, { world, title: caseName, events, caseName })
  return row.id
}

async function insertRow(id: string, story: NewStory): Promise<StoryRow | undefined> {
  const now = new Date()
  const [row] = await database()
    .insert(storyTable)
    .values({ ...story, id, createdAt: now, updatedAt: now })
    .onConflictDoNothing()
    .returning()
  return row
}

async function insertStory(prefix: string, story: NewStory): Promise<StoryRow> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await insertRow(storyId(prefix), story)
    if (row) return row
  }
  throw new StoryError('id is in use', 409)
}

export async function storyExists(id: string): Promise<boolean> {
  return (await storyWorld(id)) !== undefined
}

export async function storyWorld(id: string): Promise<string | undefined> {
  const rows = await database()
    .select({ world: storyTable.world })
    .from(storyTable)
    .where(eq(storyTable.id, id))
    .limit(1)
  return rows[0]?.world
}

export async function listStories(): Promise<StorySummary[]> {
  const [rows, keys] = await Promise.all([
    database().select().from(storyTable).orderBy(desc(storyTable.updatedAt)),
    listAssetKeys(app().assets, ['stories/', 'worlds/']),
  ])
  return rows.map((row) => {
    const story = hydrateWith(row, keys)
    const cover = getStoryCover(story)
    return {
      id: story.id,
      world: story.world,
      title: story.title,
      updatedAt: story.updatedAt,
      preview: historyPreview(story.events),
      ...(cover ? { cover } : {}),
      ...(row.caseName ? { case: row.caseName } : {}),
    }
  })
}

export async function loadStory(id: string): Promise<Story> {
  const row = await rowById(id)
  if (!row) throw new StoryError('Story not found', 404)
  return hydrate(row)
}

async function rowById(id: string): Promise<StoryRow | undefined> {
  const rows = await database()
    .select()
    .from(storyTable)
    .where(eq(storyTable.id, id))
    .limit(1)
  return rows[0]
}

async function hydrate(row: StoryRow): Promise<Story> {
  return hydrateWith(row, await storyAssetKeys(app().assets, row.id, row.world))
}

function hydrateWith(row: StoryRow, keys: Set<string>): Story {
  const story: Story = {
    id: row.id,
    world: row.world,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    events: readEvents(row.events),
    scenes: [],
    assets: [],
    cards: [],
    ...timingOf(row.timing),
  }
  applyProjection(story, keys)
  return story
}

function readEvents(raw: unknown): StoryEvent[] {
  try {
    const value = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw
    return leadCards(parseEvents(value))
  } catch {
    return []
  }
}

export function getStoryCover(story: Story): string | undefined {
  for (const scene of story.scenes) {
    const name = sceneImageName(scene)
    if (!name) continue
    const found = story.assets.find(
      (asset) => asset.name.toLowerCase() === name.toLowerCase(),
    )
    if (found?.url && found.type === 'image') return found.url
  }
  return undefined
}

function sceneImageName(scene: Scene): string | undefined {
  switch (scene.type) {
    case 'image':
      return scene.name
    case 'dialogue':
    case 'message':
      return scene.background
    case 'video':
      return undefined
    default: {
      const _exhaustive: never = scene
      return _exhaustive
    }
  }
}

function attachFiles(story: Story, keys: Set<string>): void {
  story.assets = story.assets.map((asset) => {
    const file = assetFileName(asset.name, asset.type)
    const key = pickAssetKey(keys, story.id, story.world, file)
    return key ? { ...asset, url: assetUrl(story.id, asset.name, asset.type) } : asset
  })
  for (const scene of story.scenes) {
    if (scene.type !== 'dialogue' || !scene.caption || !scene.speaker) continue
    const voice = story.cards.find(
      (card) => card.name.toLowerCase() === scene.speaker?.toLowerCase(),
    )?.voice
    if (!voice) continue
    const key = speechFileName(voice, scene.caption)
    if (pickAssetKey(keys, story.id, story.world, key)) scene.speech = { key }
  }
}

export async function saveTiming(id: string, timing: TurnTiming): Promise<void> {
  await database().update(storyTable).set({ timing }).where(eq(storyTable.id, id))
}

function timingOf(raw: TurnTiming | null): { timing: TurnTiming } | undefined {
  if (!raw || !isTurnTiming(raw)) return undefined
  return { timing: raw }
}

export async function persistStory(story: Story): Promise<void> {
  story.events = leadCards(story.events)
  const updated = new Date()
  story.updatedAt = updated.toISOString()
  await database()
    .update(storyTable)
    .set({ title: story.title, events: story.events, updatedAt: updated })
    .where(eq(storyTable.id, story.id))
}

function assetByName(story: Story, name: string): Asset | undefined {
  return story.assets.find((asset) => asset.name.toLowerCase() === name.toLowerCase())
}

export async function generateImage(
  storyId: string,
  params: { name: string },
): Promise<{ story: Story; asset: Asset; url: string }> {
  const story = await loadStory(storyId)
  const asset = assetByName(story, params.name)
  if (
    !asset ||
    asset.type !== 'image' ||
    !asset.prompt ||
    Object.keys(asset.prompt).length === 0
  ) {
    throw new Error(`No prompt for image "${params.name}"`)
  }
  const url = await generateStoryImage(
    story,
    asset.name,
    asset.prompt,
    asset.references ?? [],
  )
  asset.url = url
  return { story, asset, url }
}

export async function generateVideo(
  storyId: string,
  params: { name: string; duration?: number },
): Promise<{ story: Story; asset: Asset; url: string }> {
  const story = await loadStory(storyId)
  const asset = assetByName(story, params.name)
  if (!asset || asset.type !== 'video') throw new Error(`No video "${params.name}"`)
  const prompt = asset.prompt ?? {}
  if (Object.keys(prompt).length === 0 && !asset.firstFrame)
    throw new Error(`No prompt for video "${params.name}"`)
  const url = await generateStoryVideo(story, asset.name, prompt, {
    firstFrame: asset.firstFrame,
    lastFrame: asset.lastFrame,
    duration: params.duration ?? asset.duration,
  })
  asset.url = url
  return { story, asset, url }
}

export function readSceneLines(
  story: Story,
  options: { offset?: number; limit?: number; last?: number } = {},
): string {
  const len = story.scenes.length
  const start =
    options.last !== undefined
      ? Math.max(0, len - options.last)
      : Math.max(
          0,
          options.offset !== undefined && options.offset < 0
            ? len + options.offset
            : (options.offset ?? 0),
        )
  const end = options.limit !== undefined ? Math.min(len, start + options.limit) : len
  return story.scenes
    .slice(start, end)
    .map((scene, index) => formatScene(scene, start + index, story.assets))
    .join('\n\n')
}
