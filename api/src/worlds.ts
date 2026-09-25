import { asc, eq } from 'drizzle-orm'
import {
  project,
  type Scene,
  type StoryEvent,
  type World,
  type WorldSource,
} from 'shared'
import { app } from './context'
import { listAssetKeys, worldKey, worldPrefix } from './assets'
import { database } from './db'
import { parseEvents } from './events'
import { assetFileName, safeStoryId, worldAssetUrl } from './files'
import { worlds } from './schema'

type WorldRow = typeof worlds.$inferSelect

export async function listWorlds(): Promise<World[]> {
  const [rows, keys] = await Promise.all([
    database()
      .select()
      .from(worlds)
      .where(eq(worlds.listed, true))
      .orderBy(asc(worlds.title)),
    listAssetKeys(app().assets, ['worlds/']),
  ])
  return rows.map((row) => {
    const id = safeStoryId(row.id)
    const cover = worldCover(id, parseEvents(row.events), keys)
    return { id, title: row.title, ...(cover ? { cover } : {}) }
  })
}

export function worldRows(): Promise<WorldRow[]> {
  return database().select().from(worlds)
}

export function matchWorld(rows: WorldRow[], events: StoryEvent[]): string | undefined {
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

export async function loadWorld(id: string): Promise<WorldSource | undefined> {
  const safe = safeStoryId(id)
  const [rows, keys] = await Promise.all([
    database().select().from(worlds).where(eq(worlds.id, safe)).limit(1),
    listAssetKeys(app().assets, [worldPrefix(safe)]),
  ])
  const row = rows[0]
  if (!row) return undefined
  const events = parseEvents(row.events)
  const cover = worldCover(safe, events, keys)
  return { id: safe, title: row.title, events, ...(cover ? { cover } : {}) }
}

function worldCover(
  worldId: string,
  events: StoryEvent[],
  keys: Set<string>,
): string | undefined {
  const { scenes, assets } = project(events)
  for (const scene of scenes) {
    const name = sceneImageName(scene)
    if (!name) continue
    const asset = assets.find(
      (item) => item.type === 'image' && item.name.toLowerCase() === name.toLowerCase(),
    )
    if (!asset) continue
    const file = assetFileName(asset.name, 'image')
    if (keys.has(worldKey(worldId, file))) return worldAssetUrl(worldId, file)
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
