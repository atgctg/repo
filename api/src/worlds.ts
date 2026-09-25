import { asc, eq } from 'drizzle-orm'
import {
  project,
  type Scene,
  type StoryEvent,
  type World,
  type WorldSource,
} from 'shared'
import { app } from './context'
import { assetExists, worldKey } from './assets'
import { database } from './db'
import { parseEvents } from './events'
import { assetFileName, safeStoryId, worldAssetUrl } from './files'
import { worlds } from './schema'

export async function listWorlds(): Promise<World[]> {
  const rows = await database()
    .select()
    .from(worlds)
    .where(eq(worlds.listed, true))
    .orderBy(asc(worlds.title))
  const listed: World[] = []
  for (const row of rows) {
    const world = await loadWorld(row.id)
    if (!world) continue
    const item: World = { id: world.id, title: world.title }
    if (world.cover) item.cover = world.cover
    listed.push(item)
  }
  return listed
}

export async function matchWorld(events: StoryEvent[]): Promise<string | undefined> {
  const rows = await database().select().from(worlds)
  let bestId: string | undefined
  let best = 0
  const cards = new Set(
    events.flatMap((event) => (event.type === 'card' ? [event.name] : [])),
  )
  for (const row of rows) {
    const worldEvents = parseEvents(row.events)
    const prefix = sharedPrefix(worldEvents, events)
    const overlap = worldEvents.filter(
      (event) => event.type === 'card' && cards.has(event.name),
    ).length
    const score = prefix > 0 ? prefix : overlap
    if (score > best) {
      best = score
      bestId = row.id
    }
  }
  return bestId
}

function sharedPrefix(worldEvents: StoryEvent[], events: StoryEvent[]): number {
  const limit = Math.min(worldEvents.length, events.length)
  let count = 0
  while (
    count < limit &&
    JSON.stringify(worldEvents[count]) === JSON.stringify(events[count])
  )
    count += 1
  return count
}

export async function worldExists(id: string): Promise<boolean> {
  const rows = await database()
    .select({ id: worlds.id })
    .from(worlds)
    .where(eq(worlds.id, safeStoryId(id)))
    .limit(1)
  return rows.length > 0
}

export async function loadWorld(id: string): Promise<WorldSource | undefined> {
  const safe = safeStoryId(id)
  const rows = await database().select().from(worlds).where(eq(worlds.id, safe)).limit(1)
  const row = rows[0]
  if (!row) return undefined
  const events = parseEvents(row.events)
  const cover = await worldCover(safe, events)
  return { id: safe, title: row.title, events, ...(cover ? { cover } : {}) }
}

async function worldCover(
  worldId: string,
  events: StoryEvent[],
): Promise<string | undefined> {
  const { scenes, assets } = project(events)
  for (const scene of scenes) {
    const name = sceneImageName(scene)
    if (!name) continue
    const asset = assets.find(
      (item) => item.type === 'image' && item.name.toLowerCase() === name.toLowerCase(),
    )
    if (!asset) continue
    const file = assetFileName(asset.name, 'image')
    if (await assetExists(app().assets, worldKey(worldId, file)))
      return worldAssetUrl(worldId, file)
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
