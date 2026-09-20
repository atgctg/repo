import { parse, stringify } from 'yaml'
import { mergeAttributes } from './records'
import { captionToTranscript, errorMessage, generateStoryImage, generateStoryVideo, generateStoryVoice, assetDiskPath, assetUrl, resolveVoiceId, safeStoryId } from './generate'
import { AssetSchema, SpeechSchema, type Asset, type Card, type DialogueScene, type ImageAsset, type InsertDialogueScene, type InsertImageScene, type InsertVideoScene, type NumberedScene, type Scene, type Story, type VideoAsset, type World } from './types'

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
    scenes: [],
    assets: [],
    cards: [],
  }
}

function readCaption(raw: unknown): string | undefined {
  if (typeof raw === 'string' && raw) return raw
  if (Array.isArray(raw)) {
    const text = raw.map((item) => String(item)).join('\n').trim()
    return text || undefined
  }
  return undefined
}

function readSpeech(raw: unknown): DialogueScene['speech'] {
  if (typeof raw === 'string' && raw) return { key: raw }
  const parsed = SpeechSchema.safeParse(raw)
  return parsed.success ? parsed.data : undefined
}

function readDialogue(raw: Record<string, unknown>): DialogueScene {
  const scene: DialogueScene = { type: 'dialogue', background: String(raw.background ?? '') }
  if (typeof raw.speaker === 'string' && raw.speaker) scene.speaker = raw.speaker
  const caption = readCaption(raw.caption)
  if (caption) scene.caption = caption
  const speech = readSpeech(raw.speech)
  if (speech) scene.speech = speech
  return scene
}

function readScene(raw: Record<string, unknown>): Scene {
  switch (raw.type) {
    case 'video':
      return { type: 'video', name: String(raw.name ?? '') }
    case 'dialogue':
      return readDialogue(raw)
    default:
      return { type: 'image', name: String(raw.name ?? '') }
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
    const found = story.assets.find((m) => m.name.toLowerCase() === name.toLowerCase())
    if (found?.kind === 'image' && found.url) return found.url
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
  const rawAssets = ((raw.assets as Array<Record<string, unknown>>) ?? []).filter(
    (m) => m.kind === 'image' || m.kind === 'video',
  )
  const assets: Asset[] = await Promise.all(
    rawAssets.map(async (m) => {
      const name = String(m.name ?? '')
      const kind = m.kind === 'video' ? 'video' : 'image'
      const exists = Boolean(name) && (await Bun.file(assetDiskPath(storyId, name, kind)).exists())
      return AssetSchema.parse({
        ...m,
        name,
        kind,
        createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date().toISOString(),
        ...(exists ? { url: assetUrl(storyId, name, kind) } : {}),
      })
    }),
  )
  const story: Story = {
    id: storyId,
    title: (raw.title as string) ?? id,
    createdAt: (raw.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (raw.updatedAt as string) ?? new Date().toISOString(),
    scenes: ((raw.scenes as Array<Record<string, unknown>>) ?? []).map(readScene),
    assets,
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
    scenes: story.scenes,
    assets: story.assets.map(({ url: _url, ...asset }) => asset),
    cards: story.cards,
  }
  await Bun.write(path, stringify(toWrite, { indent: 2 }))
}

function upsertAsset(story: Story, asset: Asset): void {
  const assetIndex = story.assets.findIndex((m) => m.name.toLowerCase() === asset.name.toLowerCase())
  if (assetIndex >= 0) {
    story.assets[assetIndex] = asset
  } else {
    story.assets.push(asset)
  }
}

function createdAtFor(story: Story, name: string): string {
  return story.assets.find((m) => m.name.toLowerCase() === name.toLowerCase())?.createdAt ?? new Date().toISOString()
}

function hasPrompt(prompt?: Record<string, unknown>): prompt is Record<string, unknown> {
  return Boolean(prompt && Object.keys(prompt).length > 0)
}

function requireImage(story: Story, name: string, label: string): void {
  const asset = story.assets.find((a) => a.kind === 'image' && a.name.toLowerCase() === name.toLowerCase())
  if (!asset) throw new Error(`${label} image "${name}" not found`)
}

function spliceScene(story: Story, scene: Scene, index?: number): number {
  const at = index === undefined ? story.scenes.length : Math.max(0, Math.min(story.scenes.length, index))
  story.scenes.splice(at, 0, scene)
  return at
}

export async function generateImage(
  storyId: string,
  params: { name: string; prompt?: Record<string, unknown>; references?: string[] },
): Promise<{ story: Story; asset: ImageAsset; url: string }> {
  const { name } = params
  const story = await loadStory(storyId)
  const existing = story.assets.find((m) => m.name.toLowerCase() === name.toLowerCase())
  const existingImage = existing?.kind === 'image' ? existing : undefined
  const basePrompt = params.prompt ?? existingImage?.prompt
  if (!hasPrompt(basePrompt)) {
    throw new Error(`No prompt for image "${name}"`)
  }
  const references = (params.references ?? (params.prompt ? [] : existingImage?.references) ?? [])
    .map((item) => item.trim())
    .filter((item) => item && item.toLowerCase() !== name.toLowerCase())

  const url = await generateStoryImage(story, name, basePrompt, references)

  return updateStory(storyId, (latest) => {
    const asset: ImageAsset = {
      name,
      kind: 'image',
      prompt: basePrompt,
      createdAt: createdAtFor(latest, name),
      url,
      ...(references.length > 0 ? { references } : {}),
    }
    upsertAsset(latest, asset)
    return { story: latest, asset, url }
  })
}

function resolveVideoPrompt(
  story: Story,
  name: string,
  params: { prompt?: Record<string, unknown>; firstFrame?: string },
  existing?: VideoAsset,
): Record<string, unknown> {
  if (hasPrompt(params.prompt)) return params.prompt
  if (hasPrompt(existing?.prompt)) return existing.prompt
  if (params.firstFrame) {
    const frame = story.assets.find((m) => m.kind === 'image' && m.name.toLowerCase() === params.firstFrame!.toLowerCase())
    if (hasPrompt(frame?.prompt)) return frame.prompt
  }
  throw new Error(`No prompt for video "${name}"`)
}

export async function generateVideo(
  storyId: string,
  params: { name: string; prompt?: Record<string, unknown>; firstFrame?: string; lastFrame?: string; duration?: number },
): Promise<{ story: Story; asset: VideoAsset; url: string }> {
  const { name } = params
  const story = await loadStory(storyId)
  const existing = story.assets.find((m) => m.name.toLowerCase() === name.toLowerCase())
  const existingVideo = existing?.kind === 'video' ? existing : undefined
  const firstFrame = params.firstFrame ?? existingVideo?.firstFrame
  const lastFrame = params.lastFrame ?? existingVideo?.lastFrame
  const duration = params.duration ?? existingVideo?.duration
  const prompt = resolveVideoPrompt(story, name, { prompt: params.prompt, firstFrame }, existingVideo)

  const url = await generateStoryVideo(story, name, prompt, { firstFrame, lastFrame, duration })

  return updateStory(storyId, (latest) => {
    const asset: VideoAsset = {
      name,
      kind: 'video',
      prompt,
      createdAt: createdAtFor(latest, name),
      url,
      ...(firstFrame ? { firstFrame } : {}),
      ...(lastFrame ? { lastFrame } : {}),
      ...(duration ? { duration } : {}),
    }
    upsertAsset(latest, asset)
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

function resolveIndex(index: number, length: number): number {
  return index < 0 ? length + index : index
}

function voiceForSpeaker(story: Story, speaker?: string): string | undefined {
  if (!speaker?.trim()) return undefined
  const value = story.cards.find((c) => c.name.toLowerCase() === speaker.toLowerCase())?.attributes?.Voice
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function speakDialogueScene(
  storyId: string,
  index: number,
): Promise<{ story: Story; index: number }> {
  const story = await loadStory(storyId)
  const scene = story.scenes[index]
  if (scene?.type !== 'dialogue') throw new Error(`No dialogue scene at index ${index}`)
  if (scene.caption === undefined) throw new Error(`Scene ${index} has no caption`)
  const transcript = captionToTranscript(scene.caption)
  if (!transcript) throw new Error(`Scene ${index} has no caption`)
  const voice = voiceForSpeaker(story, scene.speaker)
  if (!voice) throw new Error(`No Voice for speaker "${scene.speaker ?? 'unknown'}"`)
  if (!resolveVoiceId(voice)) throw new Error(`Unknown voice "${voice}"`)
  const speech = await generateStoryVoice(storyId, voice, scene.caption)
  return updateStory(storyId, (latest) => {
    const target = latest.scenes[index]
    if (target?.type === 'dialogue') target.speech = speech
    return { story: latest, index }
  })
}

export async function insertImage(
  storyId: string,
  scene: InsertImageScene,
  index?: number,
): Promise<{ story: Story; index: number }> {
  if (hasPrompt(scene.prompt)) {
    await generateImage(storyId, { name: scene.name, prompt: scene.prompt, references: scene.references })
  }
  return updateStory(storyId, (story) => ({
    story,
    index: spliceScene(story, { type: 'image', name: scene.name }, index),
  }))
}

export async function insertDialogue(
  storyId: string,
  scene: InsertDialogueScene,
  index?: number,
): Promise<{ story: Story; index: number }> {
  const result = await updateStory(storyId, (story) => {
    requireImage(story, scene.background, 'Background')
    const inserted: DialogueScene = { type: 'dialogue', background: scene.background }
    if (scene.speaker) inserted.speaker = scene.speaker
    if (scene.caption !== undefined) inserted.caption = scene.caption
    return { story, index: spliceScene(story, inserted, index) }
  })
  const inserted = result.story.scenes[result.index]
  if (inserted?.type === 'dialogue' && inserted.speaker && inserted.caption && voiceForSpeaker(result.story, inserted.speaker)) {
    try {
      const voiced = await speakDialogueScene(storyId, result.index)
      return { story: voiced.story, index: result.index }
    } catch (error) {
      console.error('voice auto skip', { storyId, index: result.index, error: errorMessage(error) })
    }
  }
  return result
}

export async function insertVideo(
  storyId: string,
  scene: InsertVideoScene,
  index?: number,
): Promise<{ story: Story; index: number }> {
  const result = await updateStory(storyId, (story) => {
    if (scene.firstFrame) requireImage(story, scene.firstFrame, 'First frame')
    if (scene.lastFrame) requireImage(story, scene.lastFrame, 'Last frame')
    const at = spliceScene(story, { type: 'video', name: scene.name }, index)
    if (hasPrompt(scene.prompt)) {
      upsertAsset(story, {
        name: scene.name,
        kind: 'video',
        prompt: scene.prompt,
        createdAt: createdAtFor(story, scene.name),
        ...(scene.firstFrame ? { firstFrame: scene.firstFrame } : {}),
        ...(scene.lastFrame ? { lastFrame: scene.lastFrame } : {}),
        ...(scene.duration ? { duration: scene.duration } : {}),
      })
    }
    return { story, index: at }
  })
  if (hasPrompt(scene.prompt)) {
    void generateVideo(storyId, {
      name: scene.name,
      prompt: scene.prompt,
      firstFrame: scene.firstFrame,
      lastFrame: scene.lastFrame,
      duration: scene.duration,
    }).catch((error) => {
      console.error('async video gen error', { storyId, name: scene.name, error: errorMessage(error) })
    })
  }
  return result
}

export async function deleteScenes(
  storyId: string,
  indices: number | number[],
): Promise<{ story: Story; deleted: number[] }> {
  return updateStory(storyId, (story) => {
    const raw = Array.isArray(indices) ? indices : [indices]
    const resolved = Array.from(
      new Set(
        raw
          .map((n) => resolveIndex(n, story.scenes.length))
          .filter((n) => n >= 0 && n < story.scenes.length),
      ),
    ).sort((a, b) => b - a)

    if (resolved.length === 0) {
      throw new Error(`No valid indices to delete from [${raw.join(', ')}] (${story.scenes.length} scenes)`)
    }

    for (const idx of resolved) {
      story.scenes.splice(idx, 1)
    }

    return { story, deleted: resolved.reverse() }
  })
}

export async function readScenes(
  storyId: string,
  options: { offset?: number; limit?: number; last?: number } = {},
): Promise<NumberedScene[]> {
  const story = await loadStory(storyId)
  const len = story.scenes.length
  const { offset, limit, last } = options
  const start = last !== undefined
    ? Math.max(0, len - last)
    : Math.max(0, offset !== undefined ? resolveIndex(offset, len) : 0)
  const end = limit !== undefined ? Math.min(len, start + limit) : len

  return story.scenes
    .slice(start, end)
    .map((scene, i) => {
      const index = start + i
      if (scene.type !== 'video') return { index, ...scene }
      const asset = story.assets.find(
        (a) => a.kind === 'video' && a.name.toLowerCase() === scene.name.toLowerCase(),
      )
      return { index, ...scene, prompt: asset?.kind === 'video' ? asset.prompt : undefined }
    })
}
