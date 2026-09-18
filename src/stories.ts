import { parse, stringify } from 'yaml'
import { mergeAttributes } from './records'
import { generateStoryImage, mediaDiskPath, mediaUrl, safeStoryId } from './generate'
import type { Card, MediaAsset, NumberedSlide, Slide, Story, StorySummary } from './types'

const STORIES_DIR = `${import.meta.dir}/../stories`

const storyWrites = new Map<string, Promise<void>>()

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
  return `${STORIES_DIR}/${safeStoryId(id)}.yaml`
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

export function getStoryCover(story: Story): string | undefined {
  for (const slide of story.slides) {
    const bg = slide.background
    if (!bg) continue
    const url = story.media.find((m) => m.name.toLowerCase() === bg.toLowerCase())?.url
    if (url) return url
  }
  return undefined
}

export async function listStories(): Promise<StorySummary[]> {
  const files = Array.from(new Bun.Glob('*.yaml').scanSync(STORIES_DIR))
  const stories = await Promise.all(
    files.map(async (file) => {
      const id = file.replace(/\.yaml$/, '')
      const story = await loadStory(id)
      const cover = getStoryCover(story)
      return {
        id,
        title: story.title || id,
        ...(cover ? { cover } : {}),
      }
    }),
  )
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
  const storyId = (raw.id as string) ?? id
  const rawMedia = (raw.media as Array<Record<string, unknown>>) ?? []
  const media: MediaAsset[] = await Promise.all(
    rawMedia.map(async (m) => {
      const name = String(m.name ?? '')
      const exists = await Bun.file(mediaDiskPath(storyId, name)).exists()
      return {
        name,
        ...(m.prompt ? { prompt: m.prompt as Record<string, unknown> } : {}),
        createdAt: (m.createdAt as string) ?? new Date().toISOString(),
        ...(exists ? { url: mediaUrl(storyId, name) } : {}),
      }
    }),
  )
  const story: Story = {
    id: storyId,
    title: (raw.title as string) ?? id,
    createdAt: (raw.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (raw.updatedAt as string) ?? new Date().toISOString(),
    slides: (raw.slides as Slide[]) ?? [],
    media,
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
    media: story.media.map(({ name, prompt, createdAt }) => ({
      name,
      ...(prompt ? { prompt } : {}),
      createdAt,
    })),
    cards: story.cards,
  }
  await Bun.write(path, stringify(toWrite, { indent: 2 }))
}

export async function generateImage(
  storyId: string,
  params: { name: string; prompt?: Record<string, unknown> },
): Promise<{ story: Story; asset: MediaAsset; url: string }> {
  const { name } = params
  const story = await loadStory(storyId)
  const existing = story.media.find((m) => m.name.toLowerCase() === name.toLowerCase())
  const prompt = params.prompt ?? existing?.prompt
  if (!prompt || Object.keys(prompt).length === 0) {
    throw new Error(`No prompt for image "${name}"`)
  }

  const url = await generateStoryImage(story, name, prompt)

  return updateStory(storyId, (latest) => {
    const assetIndex = latest.media.findIndex((m) => m.name.toLowerCase() === name.toLowerCase())
    const asset: MediaAsset = {
      name,
      prompt,
      createdAt: assetIndex >= 0 ? latest.media[assetIndex]!.createdAt : new Date().toISOString(),
      url,
    }
    if (assetIndex >= 0) {
      latest.media[assetIndex] = asset
    } else {
      latest.media.push(asset)
    }
    return { story: latest, asset, url }
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

function cleanSlide(slide: Slide): Slide {
  const result: Slide = {}
  if (slide.background) result.background = slide.background
  if (slide.speaker) result.speaker = slide.speaker
  if (slide.dialogue !== undefined) result.dialogue = slide.dialogue
  return result
}

function resolveIndex(index: number, length: number): number {
  return index < 0 ? length + index : index
}

export async function insertSlide(
  storyId: string,
  slide: Slide,
  index?: number,
): Promise<{ story: Story; index: number }> {
  return updateStory(storyId, (story) => {
    const clamped = index === undefined ? story.slides.length : Math.max(0, Math.min(story.slides.length, index))
    story.slides.splice(clamped, 0, cleanSlide(slide))
    return { story, index: clamped }
  })
}

export async function deleteSlides(
  storyId: string,
  indices: number | number[],
): Promise<{ story: Story; deleted: number[] }> {
  return updateStory(storyId, (story) => {
    const raw = Array.isArray(indices) ? indices : [indices]
    const resolved = Array.from(
      new Set(
        raw
          .map((n) => resolveIndex(n, story.slides.length))
          .filter((n) => n >= 0 && n < story.slides.length),
      ),
    ).sort((a, b) => b - a)

    if (resolved.length === 0) {
      throw new Error(`No valid indices to delete from [${raw.join(', ')}] (${story.slides.length} slides)`)
    }

    for (const idx of resolved) {
      story.slides.splice(idx, 1)
    }

    return { story, deleted: resolved.reverse() }
  })
}

export async function readSlides(
  storyId: string,
  options: { offset?: number; limit?: number; last?: number } = {},
): Promise<NumberedSlide[]> {
  const story = await loadStory(storyId)
  const len = story.slides.length
  const { offset, limit, last } = options
  const start = last !== undefined
    ? Math.max(0, len - last)
    : Math.max(0, offset !== undefined ? resolveIndex(offset, len) : 0)
  const end = limit !== undefined ? Math.min(len, start + limit) : len

  return story.slides
    .slice(start, end)
    .map((slide, i) => ({ index: start + i, ...slide }))
}

export type { NumberedSlide } from './types'
