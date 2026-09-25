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
import { database, type StoryRow } from './db'
import { parseEvents } from './events'
import { assetFileName, assetUrl, resolveAssetPath, speechFileName } from './files'
import { errorMessage, generateStoryImage, generateStoryVideo } from './media'
import { formatScene } from './scene-text'
import { loadWorld, matchWorld } from './worlds'

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
  const next = project(story.events)
  story.scenes = next.scenes
  story.cards = next.cards
  story.assets = next.assets
  await attachFiles(story)
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

export async function forkWorld(worldId: string, requestedId?: string): Promise<Story> {
  const world = await loadWorld(worldId)
  if (!world) throw new StoryError('World not found', 404)
  const id = requestedId === undefined ? uniqueStoryId(world.id) : requestedId.trim()
  if (!ID_PATTERN.test(id)) throw new StoryError('id is invalid', 400)
  const existing = rowById(id)
  if (existing) {
    if (existing.world !== world.id) throw new StoryError('id is in use', 409)
    return hydrate(existing)
  }
  const now = Date.now()
  const events = leadCards(structuredClone(world.events))
  database()
    .query(
      `INSERT INTO stories (id, world, title, events, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, world.id, world.title, JSON.stringify(events), now, now)
  const created = rowById(id)
  if (!created) throw new StoryError('Story was not saved', 500)
  return hydrate(created)
}

export async function saveEvalStory(
  caseName: string,
  events: StoryEvent[],
): Promise<string> {
  const id = uniqueStoryId(caseName)
  const now = Date.now()
  const world = (await matchWorld(events)) ?? 'eval'
  database()
    .query(
      `INSERT INTO stories (id, world, title, events, created_at, updated_at, case_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, world, caseName, JSON.stringify(events), now, now, caseName)
  return id
}

function uniqueStoryId(worldId: string): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = storyId(worldId)
    if (!rowById(id)) return id
  }
  throw new StoryError('id is in use', 409)
}

export function storyExists(id: string): boolean {
  return rowById(id) !== undefined
}

export function storyWorld(id: string): string | undefined {
  return rowById(id)?.world
}

export async function listStories(): Promise<StorySummary[]> {
  const rows = database()
    .query<StoryRow, []>(
      'SELECT id, world, title, events, created_at, updated_at, case_name, passed, timing FROM stories ORDER BY updated_at DESC',
    )
    .all()
  const stories: StorySummary[] = []
  for (const row of rows) {
    const story = await hydrate(row)
    let world = story.world
    if (row.case_name && world === 'eval') {
      const matched = await matchWorld(story.events)
      if (matched) {
        world = matched
        database()
          .query('UPDATE stories SET world = ? WHERE id = ?')
          .run(matched, story.id)
      }
    }
    const cover = getStoryCover(story)
    stories.push({
      id: story.id,
      world,
      title: story.title,
      updatedAt: story.updatedAt,
      preview: historyPreview(story.events),
      ...(cover ? { cover } : {}),
      ...(row.case_name ? { case: row.case_name } : {}),
    })
  }
  return stories
}

export async function loadStory(id: string): Promise<Story> {
  const row = rowById(id)
  if (!row) throw new StoryError('Story not found', 404)
  return hydrate(row)
}

function rowById(id: string): StoryRow | undefined {
  return (
    database()
      .query<StoryRow, [string]>(
        'SELECT id, world, title, events, created_at, updated_at, case_name, passed, timing FROM stories WHERE id = ?',
      )
      .get(id) ?? undefined
  )
}

async function hydrate(row: StoryRow): Promise<Story> {
  const story: Story = {
    id: row.id,
    world: row.world,
    title: row.title,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    events: readEvents(row.events),
    scenes: [],
    assets: [],
    cards: [],
    ...timingOf(row.timing),
  }
  await refresh(story)
  return story
}

function readEvents(raw: string): StoryEvent[] {
  try {
    return leadCards(parseEvents(JSON.parse(raw) as unknown))
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

async function attachFiles(story: Story): Promise<void> {
  story.assets = await Promise.all(
    story.assets.map(async (asset) => {
      const file = assetFileName(asset.name, asset.type)
      const disk = await resolveAssetPath(story.id, story.world, file)
      return disk ? { ...asset, url: assetUrl(story.id, asset.name, asset.type) } : asset
    }),
  )
  for (const scene of story.scenes) {
    if (scene.type !== 'dialogue' || !scene.caption || !scene.speaker) continue
    const voice = story.cards.find(
      (card) => card.name.toLowerCase() === scene.speaker?.toLowerCase(),
    )?.voice
    if (!voice) continue
    const key = speechFileName(voice, scene.caption)
    if (await resolveAssetPath(story.id, story.world, key)) scene.speech = { key }
  }
}

export function saveTiming(id: string, timing: TurnTiming): void {
  database()
    .query('UPDATE stories SET timing = ? WHERE id = ?')
    .run(JSON.stringify(timing), id)
}

function timingOf(raw: string | null): { timing: TurnTiming } | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    return isTurnTiming(parsed) ? { timing: parsed } : undefined
  } catch {
    return undefined
  }
}

export async function persistStory(story: Story): Promise<void> {
  story.events = leadCards(story.events)
  const updated = Date.now()
  story.updatedAt = new Date(updated).toISOString()
  database()
    .query('UPDATE stories SET title = ?, events = ?, updated_at = ? WHERE id = ?')
    .run(story.title, JSON.stringify(story.events), updated, story.id)
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
  try {
    const url = await generateStoryImage(
      story,
      asset.name,
      asset.prompt,
      asset.references ?? [],
    )
    asset.url = url
    return { story, asset, url }
  } catch (error) {
    console.error('img gen error', {
      storyId,
      name: params.name,
      error: errorMessage(error),
    })
    throw error
  }
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
  try {
    const url = await generateStoryVideo(story, asset.name, prompt, {
      firstFrame: asset.firstFrame,
      lastFrame: asset.lastFrame,
      duration: params.duration ?? asset.duration,
    })
    asset.url = url
    return { story, asset, url }
  } catch (error) {
    console.error('video gen error', {
      storyId,
      name: params.name,
      error: errorMessage(error),
    })
    throw error
  }
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
