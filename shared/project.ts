import { mergeAttributes } from './records'
import type { Asset, Card, CardEvent, DialogueScene, Scene, StoryEvent } from './types'

export function lastUserText(events: StoryEvent[]): string {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]
    if (event?.type === 'message' && event.user && event.text.trim())
      return event.text.replace(/\s+/g, ' ').trim()
  }
  return ''
}

export function historyPreview(events: StoryEvent[]): string {
  const line = lastUserText(events)
  if (line) return line
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]
    if (event?.type === 'dialogue' && event.caption?.trim())
      return event.caption.replace(/\s+/g, ' ').trim()
  }
  return ''
}

export function leadCards(events: StoryEvent[]): StoryEvent[] {
  const cut = events.findIndex((event) => event.user)
  const head = cut < 0 ? events : events.slice(0, cut)
  const cards = head.filter((event) => event.type === 'card')
  if (
    cards.length === 0 ||
    head.slice(0, cards.length).every((event) => event.type === 'card')
  )
    return events
  const rest = head.filter((event) => event.type !== 'card')
  const tail = cut < 0 ? [] : events.slice(cut)
  return [...cards, ...rest, ...tail]
}

export function project(events: StoryEvent[]): {
  scenes: Scene[]
  assets: Asset[]
  cards: Card[]
} {
  const scenes: Scene[] = []
  const assets: Asset[] = []
  const cards: Card[] = []

  for (let index = 0; index < events.length; index++) {
    const event = events[index]
    if (event.error) continue
    switch (event.type) {
      case 'message':
        break
      case 'image': {
        const asset: Asset = {
          type: 'image',
          name: event.name,
          ...(event.prompt ? { prompt: event.prompt } : {}),
          ...(event.references?.length ? { references: event.references } : {}),
        }
        upsertAsset(assets, asset)
        placeAt(
          scenes,
          { type: 'image', name: event.name, event: index },
          event.index,
          event.replace,
        )
        break
      }
      case 'video': {
        const asset: Asset = {
          type: 'video',
          name: event.name,
          ...(event.prompt ? { prompt: event.prompt } : {}),
          ...(event.firstFrame ? { firstFrame: event.firstFrame } : {}),
          ...(event.lastFrame ? { lastFrame: event.lastFrame } : {}),
          ...(event.duration ? { duration: event.duration } : {}),
        }
        upsertAsset(assets, asset)
        placeAt(
          scenes,
          { type: 'video', name: event.name, event: index },
          event.index,
          event.replace,
        )
        break
      }
      case 'dialogue': {
        const scene: DialogueScene = {
          type: 'dialogue',
          background: event.background,
          event: index,
        }
        if (event.speaker) scene.speaker = event.speaker
        if (event.caption) scene.caption = event.caption
        placeAt(scenes, scene, event.index, event.replace)
        break
      }
      case 'card':
        upsertCard(cards, event)
        break
      case 'delete':
        dropAt(scenes, event.indices)
        break
      default: {
        const _exhaustive: never = event
        return _exhaustive
      }
    }
  }

  return { scenes, assets, cards }
}

export function formatRanges(indices: number[]): string {
  const sorted = [...new Set(indices)]
    .filter((index) => Number.isInteger(index))
    .sort((a, b) => a - b)
  if (sorted.length === 0) return ''
  const parts: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (const index of sorted.slice(1)) {
    if (index === prev + 1) {
      prev = index
      continue
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`)
    start = prev = index
  }
  parts.push(start === prev ? String(start) : `${start}-${prev}`)
  return parts.join(',')
}

function placeAt<T>(items: T[], item: T, index?: number, replace?: boolean): void {
  if (replace && index !== undefined && index >= 0 && index < items.length) {
    items[index] = item
    return
  }
  const at =
    index === undefined ? items.length : Math.max(0, Math.min(items.length, index))
  items.splice(at, 0, item)
}

function dropAt<T>(items: T[], indices: number[]): void {
  const resolved = indices
    .map((index) => (index < 0 ? items.length + index : index))
    .filter((index) => index >= 0 && index < items.length)
  for (const index of [...new Set(resolved)].sort((a, b) => b - a)) items.splice(index, 1)
}

function upsertAsset(assets: Asset[], asset: Asset): void {
  const index = assets.findIndex(
    (item) => item.name.toLowerCase() === asset.name.toLowerCase(),
  )
  if (index >= 0) assets[index] = asset
  else assets.push(asset)
}

function upsertCard(cards: Card[], event: CardEvent): void {
  const index = cards.findIndex(
    (card) => card.name.toLowerCase() === event.name.toLowerCase(),
  )
  const existing = index >= 0 ? cards[index] : undefined
  const cover = event.cover === undefined ? existing?.cover : (event.cover ?? undefined)
  const voice = event.voice === undefined ? existing?.voice : (event.voice ?? undefined)
  const attributes =
    event.attributes === undefined
      ? existing?.attributes
      : mergeAttributes(existing?.attributes ?? {}, event.attributes)
  const card: Card = { name: event.name }
  if (cover) card.cover = cover
  if (voice) card.voice = voice
  if (attributes && Object.keys(attributes).length > 0) card.attributes = attributes
  if (index >= 0) cards[index] = card
  else cards.push(card)
}
