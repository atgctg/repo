import { leadCards, project } from 'shared'
import type { Asset, Scene, Story, StoryEvent } from 'shared'
import type { Entry } from './store'

export function findAsset(assets: Asset[], name?: string | null): Asset | undefined {
  if (typeof name !== 'string' || !name) return undefined
  const key = name.toLowerCase()
  return assets.find((asset) => asset.name.toLowerCase() === key)
}

export function canPrompt(asset: Asset | undefined): boolean {
  if (!asset) return false
  const prompted = Boolean(asset.prompt && Object.keys(asset.prompt).length > 0)
  switch (asset.type) {
    case 'image':
      return prompted
    case 'video':
      return prompted || Boolean(asset.firstFrame)
    default: {
      const _exhaustive: never = asset
      return _exhaustive
    }
  }
}

export function canGenerate(asset: Asset | undefined): boolean {
  if (!asset || asset.url) return false
  return canPrompt(asset)
}

export function sceneName(scene: Scene): string {
  switch (scene.type) {
    case 'dialogue':
      return scene.background
    case 'message':
      return scene.background ?? ''
    case 'image':
    case 'video':
      return scene.name
    default: {
      const _exhaustive: never = scene
      return _exhaustive
    }
  }
}

export function sceneAsset(story: Story, scene: Scene): Asset | undefined {
  return findAsset(story.assets, sceneName(scene))
}

export function coverUrl(story: Story): string | undefined {
  for (const scene of story.scenes) {
    const asset = sceneAsset(story, scene)
    if (asset?.type === 'image' && asset.url) return asset.url
  }
  return undefined
}

export function portraitUrl(story: Story, name: string): string | undefined {
  const key = name.trim().toLowerCase()
  if (!key) return undefined
  const card = story.cards.find((item) => item.name.toLowerCase() === key)
  const cover = card?.cover?.toLowerCase()
  return (
    (cover ? findAsset(story.assets, cover)?.url : undefined) ??
    findAsset(story.assets, key)?.url
  )
}

export function sceneIndexForEvent(story: Story, eventIndex: number): number | undefined {
  const index = story.scenes.findIndex((scene) => scene.event === eventIndex)
  return index >= 0 ? index : undefined
}

export function speechSrc(story: Story, key?: string): string | undefined {
  if (!key) return undefined
  return `/assets/${encodeURIComponent(story.id)}/${encodeURIComponent(key)}`
}

function withVersion(url: string | undefined, version: number): string | undefined {
  if (!url || version === 0) return url
  const join = url.includes('?') ? '&' : '?'
  return `${url}${join}v=${version}`
}

function fileFor(entry: Entry, name: string) {
  const key = name.toLowerCase()
  return entry.files.find((file) => file.name.toLowerCase() === key)
}

export function toStory(entry: Entry, version: number): Story {
  const projected = project(leadCards(entry.events))
  const speech = new Map(entry.speech.map((mark) => [mark.event, mark.speech]))
  const assets = projected.assets.map((asset) => {
    const file = fileFor(entry, asset.name)
    if (!file) return asset
    const url = withVersion(file.url, version)
    return {
      ...asset,
      ...(url ? { url } : {}),
      ...(file.width ? { width: file.width } : {}),
      ...(file.height ? { height: file.height } : {}),
      ...(file.dominantColor ? { dominantColor: file.dominantColor } : {}),
    }
  })
  const scenes = projected.scenes.map((scene) => {
    if (scene.type !== 'dialogue') return scene
    const mark = speech.get(scene.event)
    return mark ? { ...scene, speech: mark } : scene
  })
  return {
    id: entry.id,
    world: entry.world,
    title: entry.title,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    events: entry.events,
    scenes,
    assets,
    cards: projected.cards,
    ...(entry.timing ? { timing: entry.timing } : {}),
  }
}

export function filesFrom(story: Story): Entry['files'] {
  return story.assets.map((asset) => ({
    name: asset.name,
    ...(asset.url ? { url: stripVersion(asset.url) } : {}),
    ...(asset.width ? { width: asset.width } : {}),
    ...(asset.height ? { height: asset.height } : {}),
    ...(asset.dominantColor ? { dominantColor: asset.dominantColor } : {}),
  }))
}

export function speechFrom(story: Story): Entry['speech'] {
  return story.scenes.flatMap((scene) =>
    scene.type === 'dialogue' && scene.speech
      ? [{ event: scene.event, speech: scene.speech }]
      : [],
  )
}

function stripVersion(url: string): string {
  try {
    const parsed = new URL(url, 'http://local')
    parsed.searchParams.delete('v')
    const search = parsed.searchParams.toString()
    return `${parsed.pathname}${search ? `?${search}` : ''}`
  } catch {
    return url.replace(/([?&])v=\d+/, '').replace(/\?$/, '')
  }
}

export type { StoryEvent }
