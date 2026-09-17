import { parse, stringify } from 'yaml'
import { mergeAttributes } from './attributes'
import { generateStoryImage, mediaDiskPath } from './generate'
import type { Card, MediaAsset, Slide, Story, StorySummary } from './types'

const STORIES_DIR = `${import.meta.dir}/../stories`

const storyWrites = new Map<string, Promise<void>>()

// Prevent race conditions
function updateStory<T>(storyId: string, fn: (story: Story) => T | Promise<T>): Promise<T> {
  const previous = storyWrites.get(storyId) ?? Promise.resolve()
  const next = previous.then(async () => {
    const story = await loadStory(storyId)
    const result = await fn(story)
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
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `${STORIES_DIR}/${safeId}.yaml`
}

function createEmptyStory(id: string): Story {
  const now = new Date().toISOString()
  return {
    id,
    title: id
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    createdAt: now,
    updatedAt: now,
    slides: [],
    media: [],
    cards: [],
  }
}

export async function getStoryCover(story: Story): Promise<string | undefined> {
  for (const slide of story.slides) {
    if (!slide.background) continue
    const asset = story.media.find(
      (m) => m.type === 'image' && m.name.toLowerCase() === slide.background!.toLowerCase() && Boolean(m.key),
    )
    if (asset?.key) {
      if (asset.key.startsWith('/media/')) {
        const diskPath = mediaDiskPath(story.id, asset.name)
        if (await Bun.file(diskPath).exists()) {
          return asset.key
        }
      } else {
        return asset.key
      }
    }
  }
  return undefined
}

export async function listStories(): Promise<StorySummary[]> {
  const glob = new Bun.Glob('*.yaml')
  const stories: StorySummary[] = []
  for (const file of glob.scanSync(STORIES_DIR)) {
    const id = file.replace(/\.yaml$/, '')
    const story = await loadStory(id)
    const cover = await getStoryCover(story)
    stories.push({
      id,
      title: story.title || id,
      ...(cover ? { cover } : {}),
    })
  }
  return stories.sort((a, b) => a.title.localeCompare(b.title))
}

export async function storyExists(id: string): Promise<boolean> {
  return Bun.file(getStoryPath(id)).exists()
}

export async function loadStory(id: string): Promise<Story> {
  const file = Bun.file(getStoryPath(id))
  if (!(await file.exists())) {
    return createEmptyStory(id)
  }
  const content = await file.text()
  const raw = parse(content) as Record<string, unknown>
  const story: Story = {
    id: (raw.id as string) ?? id,
    title: (raw.title as string) ?? id,
    createdAt: (raw.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (raw.updatedAt as string) ?? new Date().toISOString(),
    slides: (raw.slides as Slide[]) ?? [],
    media: (raw.media as MediaAsset[]) ?? [],
    cards: (raw.cards as Card[]) ?? [],
  }
  return story
}

export async function persistStory(story: Story): Promise<void> {
  const path = getStoryPath(story.id)
  const toWrite: Story = {
    id: story.id,
    title: story.title,
    createdAt: story.createdAt,
    updatedAt: new Date().toISOString(),
    slides: story.slides,
    media: story.media,
    cards: story.cards,
  }
  await Bun.write(path, stringify(toWrite, { indent: 2 }))
}

export async function createImage(
  storyId: string,
  params: {
    name: string
    prompt: Record<string, unknown>
  },
): Promise<{ story: Story; asset: MediaAsset }> {
  const snapshot = await loadStory(storyId)
  const createdAt =
    snapshot.media.find((m) => m.type === 'image' && m.name.toLowerCase() === params.name.toLowerCase())
      ?.createdAt ?? new Date().toISOString()
  const key = await generateStoryImage(snapshot, params.name, params.prompt)

  return updateStory(storyId, (story) => {
    const asset: MediaAsset = {
      type: 'image',
      name: params.name,
      prompt: params.prompt,
      createdAt,
      key,
    }
    const assetIndex = story.media.findIndex(
      (m) => m.type === 'image' && m.name.toLowerCase() === params.name.toLowerCase(),
    )
    if (assetIndex >= 0) {
      story.media[assetIndex] = asset
    } else {
      story.media.push(asset)
    }
    return { story, asset }
  })
}

export type AppendSlideParams = {
  background?: string
  speaker?: string
  dialogue?: string | string[]
  slides?: Slide[]
}

export async function appendSlide(
  storyId: string,
  params: AppendSlideParams,
): Promise<{ story: Story; indices: number[] }> {
  const toAdd: Slide[] = []

  if (params.slides && params.slides.length > 0) {
    for (const s of params.slides) {
      const background = s.background ?? params.background
      const speaker = s.speaker ?? params.speaker
      toAdd.push({
        ...(background ? { background } : {}),
        ...(speaker ? { speaker } : {}),
        ...(s.dialogue !== undefined ? { dialogue: s.dialogue } : {}),
      })
    }
  } else if (params.dialogue !== undefined) {
    toAdd.push({
      ...(params.background ? { background: params.background } : {}),
      ...(params.speaker ? { speaker: params.speaker } : {}),
      dialogue: params.dialogue,
    })
  } else if (params.background || params.speaker) {
    toAdd.push({
      ...(params.background ? { background: params.background } : {}),
      ...(params.speaker ? { speaker: params.speaker } : {}),
    })
  }

  return updateStory(storyId, (story) => {
    const startIndex = story.slides.length
    story.slides.push(...toAdd)
    const indices = toAdd.map((_, i) => startIndex + i)
    return { story, indices }
  })
}

export async function generateMediaImage(
  storyId: string,
  name: string,
): Promise<{ story: Story; key: string }> {
  const story = await loadStory(storyId)
  const asset = story.media.find((item) => item.type === 'image' && item.name.toLowerCase() === name.toLowerCase())
  if (!asset?.prompt || Object.keys(asset.prompt).length === 0) {
    throw new Error(`No prompt for image "${name}"`)
  }
  const key = await generateStoryImage(story, asset.name, asset.prompt)
  return updateStory(storyId, (latest) => {
    const target = latest.media.find(
      (item) => item.type === 'image' && item.name.toLowerCase() === name.toLowerCase(),
    )
    if (!target) {
      throw new Error(`Image "${name}" disappeared before persist`)
    }
    target.key = key
    return { story: latest, key }
  })
}

export async function setCard(
  storyId: string,
  params: {
    name: string
    cover?: string | null
    attributes?: Record<string, unknown>
  },
): Promise<Story> {
  return updateStory(storyId, (story) => {
    const existingIdx = story.cards.findIndex((c) => c.name.toLowerCase() === params.name.toLowerCase())
    const existing = existingIdx >= 0 ? story.cards[existingIdx] : undefined

    const cover = params.cover === undefined ? existing?.cover : (params.cover ?? undefined)
    const attributes =
      params.attributes === undefined
        ? (existing?.attributes ?? {})
        : mergeAttributes(existing?.attributes ?? {}, params.attributes)

    const card: Card = {
      name: params.name,
      cover,
      attributes,
    }

    if (existingIdx >= 0) {
      story.cards[existingIdx] = card
    } else {
      story.cards.push(card)
    }

    return story
  })
}

export type NumberedSlide = Slide & { index: number }

export type ScriptOp = { storyId?: string } & (
  | { op: 'read'; last?: number; offset?: number; limit?: number }
  | { op: 'replace'; index: number; slide: Slide }
  | { op: 'insert'; index: number; slide: Slide }
  | { op: 'delete'; indices?: number | number[] }
)

export type ScriptOpResult =
  | { ok: true; story: Story; slides: NumberedSlide[] }
  | { ok: false; error: string }

function resolveIndex(index: number, length: number): number {
  return index < 0 ? length + index : index
}

export async function mutateScript(storyId: string, params: ScriptOp): Promise<ScriptOpResult> {
  if (params.op === 'read') {
    const story = await loadStory(storyId)
    let start = 0
    let end = story.slides.length

    if (params.last !== undefined) {
      start = Math.max(0, story.slides.length - params.last)
    } else {
      if (params.offset !== undefined) {
        start = Math.max(0, resolveIndex(params.offset, story.slides.length))
      }
      if (params.limit !== undefined) {
        end = Math.min(story.slides.length, start + params.limit)
      }
    }

    const slides: NumberedSlide[] = []
    for (let i = start; i < end; i++) {
      const slide = story.slides[i]
      if (slide) slides.push({ index: i, ...slide })
    }
    return { ok: true, story, slides }
  }

  return updateStory(storyId, (story) => {
    switch (params.op) {
      case 'replace': {
        const idx = resolveIndex(params.index, story.slides.length)
        if (idx < 0 || idx >= story.slides.length) {
          return { ok: false, error: `Index ${params.index} out of bounds (${story.slides.length} slides)` }
        }
        story.slides[idx] = params.slide
        return { ok: true, story, slides: [{ index: idx, ...params.slide }] }
      }
      case 'insert': {
        const idx = resolveIndex(params.index, story.slides.length)
        const clamped = Math.max(0, Math.min(story.slides.length, idx))
        story.slides.splice(clamped, 0, params.slide)
        return { ok: true, story, slides: [{ index: clamped, ...params.slide }] }
      }
      case 'delete': {
        if (params.indices === undefined) {
          return { ok: false, error: 'delete requires indices' }
        }
        const rawIndices = Array.isArray(params.indices) ? params.indices : [params.indices]
        const resolved = rawIndices
          .map((n) => resolveIndex(n, story.slides.length))
          .filter((n) => n >= 0 && n < story.slides.length)

        const uniqueSortedDesc = Array.from(new Set(resolved)).sort((a, b) => b - a)
        if (uniqueSortedDesc.length === 0) {
          return { ok: false, error: `No valid indices to delete from [${rawIndices.join(', ')}]` }
        }

        const deleted: NumberedSlide[] = []
        for (const idx of uniqueSortedDesc) {
          const [removed] = story.slides.splice(idx, 1)
          if (removed) deleted.push({ index: idx, ...removed })
        }

        return { ok: true, story, slides: deleted.reverse() }
      }
      default: {
        const _exhaustive: never = params
        return { ok: false, error: `Unhandled op: ${JSON.stringify(_exhaustive)}` }
      }
    }
  })
}
