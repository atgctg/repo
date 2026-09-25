import { parse } from 'yaml'
import {
  project,
  type Scene,
  type StoryEvent,
  type World,
  type WorldSource,
} from 'shared'
import { parseEvents } from './events'
import {
  assetFileName,
  safeStoryId,
  worldAssetPath,
  worldAssetUrl,
  WORLDS_DIR,
} from './files'

export async function listWorlds(): Promise<World[]> {
  const files = Array.from(new Bun.Glob('*.yaml').scanSync(WORLDS_DIR))
  const worlds = await Promise.all(
    files.map(async (file) => {
      const id = file.replace(/\.yaml$/, '')
      const world = await loadWorld(id)
      if (!world) return undefined
      const item: World = { id: world.id, title: world.title }
      if (world.cover) item.cover = world.cover
      return item
    }),
  )
  return worlds
    .filter((world): world is World => world !== undefined)
    .sort((a, b) => a.title.localeCompare(b.title))
}

export async function matchWorld(events: StoryEvent[]): Promise<string | undefined> {
  const files = Array.from(new Bun.Glob('*.yaml').scanSync(WORLDS_DIR))
  let bestId: string | undefined
  let best = 0
  const cards = new Set(
    events.flatMap((event) => (event.type === 'card' ? [event.name] : [])),
  )
  for (const file of files) {
    const world = await loadWorld(file.replace(/\.yaml$/, ''))
    if (!world) continue
    const prefix = sharedPrefix(world.events, events)
    const overlap = world.events.filter(
      (event) => event.type === 'card' && cards.has(event.name),
    ).length
    const score = prefix > 0 ? prefix : overlap
    if (score > best) {
      best = score
      bestId = world.id
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
  return Bun.file(worldPath(id)).exists()
}

export async function loadWorld(id: string): Promise<WorldSource | undefined> {
  const safe = safeStoryId(id)
  const file = Bun.file(worldPath(safe))
  if (!(await file.exists())) return undefined
  const raw = parse(await file.text()) as Record<string, unknown>
  const title = typeof raw.title === 'string' ? raw.title : safe
  const events = parseEvents(raw.events)
  const cover = await worldCover(safe, events)
  return { id: safe, title, events, ...(cover ? { cover } : {}) }
}

function worldPath(id: string): string {
  return `${WORLDS_DIR}/${safeStoryId(id)}.yaml`
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
    if (await Bun.file(worldAssetPath(worldId, file)).exists())
      return worldAssetUrl(worldId, file)
  }
  return undefined
}

function sceneImageName(scene: Scene): string | undefined {
  switch (scene.type) {
    case 'image':
      return scene.name
    case 'dialogue':
      return scene.background
    case 'video':
      return undefined
    default: {
      const _exhaustive: never = scene
      return _exhaustive
    }
  }
}
