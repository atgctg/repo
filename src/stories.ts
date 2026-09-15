import { parse, stringify } from 'yaml'
import { generateStoryImage } from './generate'
import { resolveSlides, sparsifySlides } from './slides'
import type { Card, MediaAsset, Slide, Story } from './types'

const STORIES_DIR = `${import.meta.dir}/../stories`

function getStoryPath(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `${STORIES_DIR}/${safeId}.yaml`
}

function createEmptyStory(id: string): Story {
  const now = new Date().toISOString()
  return {
    meta: {
      id,
      createdAt: now,
      updatedAt: now,
    },
    slides: [],
    media: [],
    cards: [],
  }
}

export async function listStories(): Promise<string[]> {
  const glob = new Bun.Glob('*.yaml')
  const ids: string[] = []
  for (const file of glob.scanSync(STORIES_DIR)) {
    ids.push(file.replace(/\.yaml$/, ''))
  }
  return ids.sort()
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
  const story = parse(content) as Story
  story.cards ??= []
  return story
}

async function persistStory(story: Story): Promise<void> {
  const path = getStoryPath(story.meta.id)
  const toWrite: Story = {
    ...story,
    slides: sparsifySlides(story.slides),
  }
  await Bun.write(path, stringify(toWrite, { indent: 2 }))
}

async function loadResolvedStory(id: string): Promise<Story> {
  const story = await loadStory(id)
  story.slides = resolveSlides(story.slides)
  return story
}

export async function getCurrentBackground(storyId: string): Promise<string | undefined> {
  const story = await loadResolvedStory(storyId)
  return story.slides.at(-1)?.background
}

export async function addDialogue(
  storyId: string,
  params: {
    speaker: string
    text: string | string[]
  },
): Promise<{ story: Story; indices: number[] }> {
  const story = await loadResolvedStory(storyId)
  const background = story.slides.at(-1)?.background
  const lines = Array.isArray(params.text) ? params.text : [params.text]
  const indices: number[] = []

  for (const line of lines) {
    indices.push(story.slides.length)
    story.slides.push({
      speaker: params.speaker,
      dialogue: line,
      ...(background ? { background } : {}),
    })
  }

  await persistStory(story)
  return { story, indices }
}

export async function setImage(
  storyId: string,
  params: {
    name: string
    prompt?: Record<string, unknown>
  },
): Promise<{ story: Story; index: number }> {
  const story = await loadResolvedStory(storyId)
  const now = new Date().toISOString()

  if (params.prompt) {
    const existingIndex = story.media.findIndex(
      (m) => m.type === 'image' && m.name.toLowerCase() === params.name.toLowerCase(),
    )

    const existing = existingIndex >= 0 ? story.media[existingIndex] : undefined

    const newAsset: MediaAsset = {
      type: 'image',
      name: params.name,
      key: existing?.key,
      prompt: params.prompt,
      createdAt: existing?.createdAt ?? now,
    }

    if (existingIndex >= 0) {
      story.media[existingIndex] = newAsset
    } else {
      story.media.push(newAsset)
    }
  }

  let index = story.slides.length - 1
  const lastSlide = story.slides[index]
  if (lastSlide && !lastSlide.background) {
    lastSlide.background = params.name
  } else {
    index = story.slides.length
    story.slides.push({ background: params.name })
  }

  await persistStory(story)

  const pending = story.media.find(
    (item) => item.type === 'image' && item.name.toLowerCase() === params.name.toLowerCase(),
  )
  if (params.prompt && pending && !pending.key) {
    pending.key = await generateStoryImage(story, pending.name, params.prompt)
    await persistStory(story)
  }

  return { story, index }
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
  asset.key = await generateStoryImage(story, asset.name, asset.prompt)
  await persistStory(story)
  return { story, key: asset.key }
}

export async function setCard(
  storyId: string,
  params: {
    name: string
    cover?: string
    attributes?: Record<string, unknown>
  },
): Promise<Story> {
  const story = await loadStory(storyId)
  const now = new Date().toISOString()

  const existingIdx = story.cards.findIndex((c) => c.name.toLowerCase() === params.name.toLowerCase())
  const existing = existingIdx >= 0 ? story.cards[existingIdx] : undefined

  const card: Card = {
    name: params.name,
    cover: params.cover ?? existing?.cover,
    attributes: params.attributes ?? existing?.attributes ?? {},
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  if (existingIdx >= 0) {
    story.cards[existingIdx] = card
  } else {
    story.cards.push(card)
  }

  await persistStory(story)
  return story
}

export type SlideQuery = {
  index?: number | number[]
  dialogue?: string
  speaker?: string
}

export type NumberedSlide = Slide & { index: number }

export type SlideOp =
  | { op: 'get'; query?: SlideQuery }
  | { op: 'delete'; query: SlideQuery }
  | { op: 'edit'; query: SlideQuery; slide: Slide }
  | { op: 'insert_before'; query: SlideQuery; slide: Slide }
  | { op: 'insert_after'; query: SlideQuery; slide: Slide }

export type SlideOpResult =
  | { ok: true; story: Story; slides: NumberedSlide[] }
  | { ok: false; error: string }

function queryHasSelector(query?: SlideQuery): boolean {
  if (!query) return false
  if (query.index !== undefined) return true
  if (query.dialogue?.trim()) return true
  if (query.speaker?.trim()) return true
  return false
}

function findSlideIndices(slides: Slide[], query?: SlideQuery): number[] {
  if (!queryHasSelector(query)) {
    return slides.map((_, i) => i)
  }

  const q = query!

  if (q.index !== undefined) {
    const raw = Array.isArray(q.index) ? q.index : [q.index]
    const matched: number[] = []
    for (const n of raw) {
      const idx = n < 0 ? slides.length + n : n
      if (idx >= 0 && idx < slides.length && !matched.includes(idx)) {
        matched.push(idx)
      }
    }
    return matched.sort((a, b) => a - b)
  }

  const dialogue = q.dialogue?.trim().toLowerCase()
  const speaker = q.speaker?.trim().toLowerCase()
  const matches: number[] = []

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    if (!slide) continue
    if (dialogue && !slide.dialogue?.toLowerCase().includes(dialogue)) continue
    if (speaker && slide.speaker?.toLowerCase() !== speaker) continue
    matches.push(i)
  }

  return matches
}

function withIndex(slides: Slide[], indices: number[]): NumberedSlide[] {
  return indices.flatMap((index) => {
    const slide = slides[index]
    return slide ? [{ index, ...slide }] : []
  })
}

export async function mutateSlide(storyId: string, params: SlideOp): Promise<SlideOpResult> {
  const story = await loadResolvedStory(storyId)

  if (params.op === 'get') {
    const indices = findSlideIndices(story.slides, params.query)
    return { ok: true, story, slides: withIndex(story.slides, indices) }
  }

  if (!queryHasSelector(params.query)) {
    return { ok: false, error: `${params.op} requires query.index, query.dialogue, or query.speaker` }
  }

  const targetIndices = findSlideIndices(story.slides, params.query)
  if (targetIndices.length === 0) {
    return { ok: false, error: `No slides matched query: ${JSON.stringify(params.query)}` }
  }

  switch (params.op) {
    case 'delete': {
      const slides = withIndex(story.slides, targetIndices)
      for (const idx of [...targetIndices].sort((a, b) => b - a)) {
        story.slides.splice(idx, 1)
      }
      await persistStory(story)
      return { ok: true, story, slides }
    }
    case 'edit': {
      for (const idx of targetIndices) {
        story.slides[idx] = {
          ...story.slides[idx],
          ...params.slide,
        }
      }
      await persistStory(story)
      return { ok: true, story, slides: withIndex(story.slides, targetIndices) }
    }
    case 'insert_before':
    case 'insert_after': {
      if (targetIndices.length !== 1) {
        return {
          ok: false,
          error: `${params.op} needs exactly one target, got ${targetIndices.length}: [${targetIndices.join(', ')}]`,
        }
      }
      const targetIdx = targetIndices[0]!
      const insertAt = params.op === 'insert_before' ? targetIdx : targetIdx + 1
      story.slides.splice(insertAt, 0, params.slide)
      await persistStory(story)
      return { ok: true, story, slides: withIndex(story.slides, [insertAt]) }
    }
    default: {
      const _exhaustive: never = params
      return { ok: false, error: `Unhandled op: ${JSON.stringify(_exhaustive)}` }
    }
  }
}
