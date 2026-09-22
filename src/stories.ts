import { parse, stringify } from 'yaml'
import {
  STORIES_DIR,
  assetDiskPath,
  assetUrl,
  safeStoryId,
  speechFileName,
  storyAssetPath,
} from './files'
import { errorMessage, generateStoryImage, generateStoryVideo } from './media'
import { leadCards, project } from './project'
import type { Asset, Scene, Story, StoryEvent, World } from './types'

const storyWrites = new Map<string, Promise<void>>()

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

function getStoryPath(id: string): string {
  return `${STORIES_DIR}/${safeStoryId(id)}.yaml`
}

function createEmptyStory(id: string): Story {
  const now = new Date().toISOString()
  return {
    id,
    title: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    createdAt: now,
    updatedAt: now,
    events: [],
    scenes: [],
    assets: [],
    cards: [],
  }
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

export async function listStories(): Promise<World[]> {
  const files = Array.from(new Bun.Glob('*.yaml').scanSync(STORIES_DIR))
  const stories = await Promise.all(
    files.map(async (file) => {
      const id = file.replace(/\.yaml$/, '')
      const story = await loadStory(id)
      const cover = getStoryCover(story)
      return { id, title: story.title || id, ...(cover ? { cover } : {}) }
    }),
  )
  return stories.sort((a, b) => a.title.localeCompare(b.title))
}

export async function storyExists(id: string): Promise<boolean> {
  return Bun.file(getStoryPath(id)).exists()
}

export async function loadStory(id: string): Promise<Story> {
  const file = Bun.file(getStoryPath(id))
  if (!(await file.exists())) return createEmptyStory(id)
  const raw = parse(await file.text()) as Record<string, unknown>
  const story: Story = {
    id: typeof raw.id === 'string' ? raw.id : id,
    title: typeof raw.title === 'string' ? raw.title : id,
    createdAt:
      typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt:
      typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    events: leadCards(parseEvents(raw.events)),
    scenes: [],
    assets: [],
    cards: [],
  }
  await refresh(story)
  return story
}

function parseEvents(value: unknown): StoryEvent[] {
  if (!Array.isArray(value)) return []
  const events: StoryEvent[] = []
  for (const item of value) {
    const event = parseEvent(item)
    if (event) events.push(event)
  }
  return events
}

function parseEvent(value: unknown): StoryEvent | undefined {
  if (!isRecord(value)) return undefined
  const shared = {
    ...(typeof value.user === 'string' ? { user: value.user } : {}),
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
  }
  switch (value.type) {
    case 'message':
      return typeof value.text === 'string'
        ? { type: 'message', text: value.text, ...shared }
        : undefined
    case 'image':
      return typeof value.name === 'string'
        ? { type: 'image', ...media(value), ...insert(value), ...shared }
        : undefined
    case 'video':
      return typeof value.name === 'string'
        ? {
            type: 'video',
            ...media(value),
            ...frames(value),
            ...insert(value),
            ...shared,
          }
        : undefined
    case 'dialogue': {
      if (typeof value.background !== 'string') return undefined
      const speaker = typeof value.speaker === 'string' ? value.speaker : undefined
      const caption = typeof value.caption === 'string' ? value.caption : undefined
      return {
        type: 'dialogue',
        background: value.background,
        ...(speaker ? { speaker } : {}),
        ...(caption ? { caption } : {}),
        ...insert(value),
        ...shared,
      }
    }
    case 'card':
      if (typeof value.name !== 'string') return undefined
      return {
        type: 'card',
        name: value.name,
        ...(value.cover === null || typeof value.cover === 'string'
          ? { cover: value.cover }
          : {}),
        ...(value.voice === null || typeof value.voice === 'string'
          ? { voice: value.voice }
          : {}),
        ...(isRecord(value.attributes) ? { attributes: value.attributes } : {}),
        ...shared,
      }
    case 'delete': {
      if (!Array.isArray(value.indices)) return undefined
      return {
        type: 'delete',
        indices: value.indices.filter(
          (index): index is number => typeof index === 'number',
        ),
        ...shared,
      }
    }
    default:
      return undefined
  }
}

function media(value: Record<string, unknown>): {
  name: string
  prompt?: Record<string, unknown>
  width?: number
  height?: number
  dominantColor?: string
  references?: string[]
} {
  const references = Array.isArray(value.references)
    ? value.references.filter((item): item is string => typeof item === 'string')
    : []
  return {
    name: typeof value.name === 'string' ? value.name : '',
    ...(isRecord(value.prompt) ? { prompt: value.prompt } : {}),
    ...(typeof value.width === 'number' ? { width: value.width } : {}),
    ...(typeof value.height === 'number' ? { height: value.height } : {}),
    ...(typeof value.dominantColor === 'string'
      ? { dominantColor: value.dominantColor }
      : {}),
    ...(references.length > 0 ? { references } : {}),
  }
}

function frames(value: Record<string, unknown>): {
  firstFrame?: string
  lastFrame?: string
  duration?: number
} {
  return {
    ...(typeof value.firstFrame === 'string' ? { firstFrame: value.firstFrame } : {}),
    ...(typeof value.lastFrame === 'string' ? { lastFrame: value.lastFrame } : {}),
    ...(typeof value.duration === 'number' ? { duration: value.duration } : {}),
  }
}

function insert(value: Record<string, unknown>): { index?: number; replace?: boolean } {
  return {
    ...(typeof value.index === 'number' ? { index: value.index } : {}),
    ...(value.replace === true ? { replace: true } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function attachFiles(story: Story): Promise<void> {
  story.assets = await Promise.all(
    story.assets.map(async (asset) => {
      const exists = await Bun.file(
        assetDiskPath(story.id, asset.name, asset.type),
      ).exists()
      return exists
        ? { ...asset, url: assetUrl(story.id, asset.name, asset.type) }
        : asset
    }),
  )
  for (const scene of story.scenes) {
    if (scene.type !== 'dialogue' || !scene.caption || !scene.speaker) continue
    const voice = story.cards.find(
      (card) => card.name.toLowerCase() === scene.speaker?.toLowerCase(),
    )?.voice
    if (!voice) continue
    const key = speechFileName(voice, scene.caption)
    if (await Bun.file(storyAssetPath(story.id, key)).exists()) scene.speech = { key }
  }
}

export async function persistStory(story: Story): Promise<void> {
  story.events = leadCards(story.events)
  story.updatedAt = new Date().toISOString()
  const body = {
    id: story.id,
    title: story.title,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
    events: story.events,
  }
  await Bun.write(getStoryPath(story.id), stringify(body, { indent: 2 }))
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
    .map((scene, index) => formatScene(scene, start + index, story))
    .join('\n\n')
}

function formatScene(scene: Scene, index: number, story: Story): string {
  switch (scene.type) {
    case 'image':
      return `[${index}] image ${scene.name}`
    case 'dialogue':
      return [`[${index}] dialogue ${scene.background}`, scene.speaker, scene.caption]
        .filter(Boolean)
        .join('\n')
    case 'video': {
      const prompt = story.assets.find(
        (asset) => asset.name.toLowerCase() === scene.name.toLowerCase(),
      )?.prompt
      const body = prompt ? stringify(prompt, { indent: 2 }).trim() : ''
      return body
        ? `[${index}] video ${scene.name}\n${body}`
        : `[${index}] video ${scene.name}`
    }
    default: {
      const _exhaustive: never = scene
      return _exhaustive
    }
  }
}
