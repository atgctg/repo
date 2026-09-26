import { asc, eq } from 'drizzle-orm'
import { coverUrl, project, type StoryEvent, type World, type WorldSource } from 'shared'
import { app } from './context'
import { listAssetKeys, worldKey, worldPrefix } from './assets'
import { database } from './db'
import { parseEvents } from './events'
import { assetFileName, safeStoryId, worldAssetUrl } from './files'
import { worlds } from './schema'

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

export async function findWorld(id: string): Promise<WorldSource | undefined> {
  const rows = await database().select().from(worlds).where(eq(worlds.id, id)).limit(1)
  const row = rows[0]
  return row && { id: row.id, title: row.title, events: parseEvents(row.events) }
}

export async function loadWorld(id: string): Promise<WorldSource | undefined> {
  const safe = safeStoryId(id)
  const [world, keys] = await Promise.all([
    findWorld(safe),
    listAssetKeys(app().assets, [worldPrefix(safe)]),
  ])
  if (!world) return undefined
  const cover = worldCover(safe, world.events, keys)
  return { ...world, ...(cover ? { cover } : {}) }
}

function worldCover(
  worldId: string,
  events: StoryEvent[],
  keys: Set<string>,
): string | undefined {
  const { scenes, assets } = project(events)
  return coverUrl({
    scenes,
    assets: assets.map((asset) => {
      const file = assetFileName(asset.name, asset.type)
      return keys.has(worldKey(worldId, file))
        ? { ...asset, url: worldAssetUrl(worldId, file) }
        : asset
    }),
  })
}
