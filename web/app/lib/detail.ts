import { formatRanges, isPlainObject } from 'shared'
import type { Asset, Attributes, Card, Scene, Story, StoryEvent } from 'shared'
import type { IconName } from '~/components/icons'
import { findAsset, sceneAsset, sceneName } from './view'

export type DetailBlock =
  | { type: 'quote'; text: string }
  | { type: 'chip'; icon: IconName; text: string }
  | { type: 'meta'; text: string }
  | { type: 'error'; text: string }
  | { type: 'swatch'; color: string }
  | { type: 'figure'; url: string; label?: string }
  | { type: 'frames'; items: { url: string; label: string }[] }
  | { type: 'refs'; items: { url?: string; label: string }[] }
  | { type: 'attrs'; value: Attributes }

function push(blocks: DetailBlock[], block: DetailBlock | undefined): void {
  if (block) blocks.push(block)
}

function sizeBlock(width?: number, height?: number): DetailBlock | undefined {
  if (width && height) return { type: 'meta', text: `${width} × ${height}` }
  if (width) return { type: 'meta', text: `${width} wide` }
  if (height) return { type: 'meta', text: `${height} tall` }
  return undefined
}

function placementBlock(event: {
  index?: number
  replace?: boolean
}): DetailBlock | undefined {
  if (event.replace && event.index !== undefined)
    return { type: 'meta', text: `Replaces scene ${event.index}` }
  if (event.index !== undefined)
    return { type: 'meta', text: `Inserted at ${event.index}` }
  return undefined
}

function refBlock(story: Story, names: string[] | undefined): DetailBlock | undefined {
  if (!names || names.length === 0) return undefined
  return {
    type: 'refs',
    items: names.map((name) => {
      const url = findAsset(story.assets, name)?.url
      return { label: name, ...(url ? { url } : {}) }
    }),
  }
}

function frameBlock(
  story: Story,
  first: string | undefined,
  last: string | undefined,
): DetailBlock | undefined {
  const items = [
    { label: 'First', name: first },
    { label: 'Last', name: last },
  ].flatMap((frame) => {
    const url = findAsset(story.assets, frame.name)?.url
    return url ? [{ label: frame.label, url }] : []
  })
  if (items.length === 0) return undefined
  return { type: 'frames', items }
}

function mediaBlocks(
  story: Story,
  media: {
    type: 'image' | 'video'
    width?: number
    height?: number
    dominantColor?: string
    duration?: number
    references?: string[]
    prompt?: Attributes
    firstFrame?: string
    lastFrame?: string
  },
): DetailBlock[] {
  const blocks: DetailBlock[] = []
  push(blocks, sizeBlock(media.width, media.height))
  if (media.dominantColor) blocks.push({ type: 'swatch', color: media.dominantColor })
  if (media.type === 'video' && media.duration)
    blocks.push({ type: 'meta', text: `${media.duration}s` })
  if (media.type === 'video')
    push(blocks, frameBlock(story, media.firstFrame, media.lastFrame))
  push(blocks, refBlock(story, media.references))
  if (isPlainObject(media.prompt)) blocks.push({ type: 'attrs', value: media.prompt })
  return blocks
}

function relatedCard(story: Story, scene: Scene): Card | undefined {
  if (scene.type === 'dialogue' && scene.speaker) {
    const speaker = story.cards.find(
      (card) => card.name.toLowerCase() === scene.speaker?.toLowerCase(),
    )
    if (speaker) return speaker
  }
  const name = sceneName(scene)
  return story.cards.find(
    (card) =>
      card.cover?.toLowerCase() === name.toLowerCase() ||
      card.name.toLowerCase() === name.toLowerCase(),
  )
}

export function sceneBlocks(story: Story, scene: Scene): DetailBlock[] {
  if (scene.type === 'message')
    return scene.text ? [{ type: 'quote', text: scene.text }] : []
  const name = sceneName(scene)
  const asset = sceneAsset(story, scene)
  const card = relatedCard(story, scene)
  const source = story.events[scene.event]
  const fromEvent =
    source && (source.type === 'image' || source.type === 'video') ? source : undefined
  const blocks: DetailBlock[] = []
  if (scene.type === 'dialogue' && scene.speaker && scene.speaker !== name)
    blocks.push({ type: 'chip', icon: 'person', text: scene.speaker })
  if (scene.type === 'dialogue' && scene.caption)
    blocks.push({ type: 'quote', text: scene.caption })
  if (
    scene.type === 'dialogue' &&
    scene.speech?.words?.length &&
    scene.speech.words.join(' ') !== scene.caption
  ) {
    blocks.push({ type: 'meta', text: scene.speech.words.join(' ') })
  }
  if (card?.voice) blocks.push({ type: 'chip', icon: 'mic', text: card.voice })
  if (asset) blocks.push(...mediaBlocks(story, asset))
  else if (fromEvent) blocks.push(...mediaBlocks(story, fromEvent))
  if (card?.attributes) blocks.push({ type: 'attrs', value: card.attributes })
  return blocks
}

function eventMedia(
  story: Story,
  event: Extract<StoryEvent, { type: 'image' | 'video' }>,
): DetailBlock[] {
  const asset = findAsset(story.assets, event.name)
  const media = {
    ...event,
    ...(asset?.url ? { url: asset.url } : {}),
    ...(asset?.width && event.width === undefined ? { width: asset.width } : {}),
    ...(asset?.height && event.height === undefined ? { height: asset.height } : {}),
    ...(asset?.dominantColor && !event.dominantColor
      ? { dominantColor: asset.dominantColor }
      : {}),
  }
  const blocks = mediaBlocks(story, media)
  push(blocks, placementBlock(event))
  push(blocks, event.error ? { type: 'error', text: event.error } : undefined)
  return blocks
}

export function eventDetail(story: Story, event: StoryEvent): DetailBlock[] {
  switch (event.type) {
    case 'input':
    case 'output':
      return event.error ? [{ type: 'error', text: event.error }] : []
    case 'dialogue': {
      const blocks: DetailBlock[] = []
      push(blocks, placementBlock(event))
      push(blocks, event.error ? { type: 'error', text: event.error } : undefined)
      return blocks
    }
    case 'image':
    case 'video':
      return eventMedia(story, event)
    case 'card': {
      const blocks: DetailBlock[] = []
      if (event.voice) blocks.push({ type: 'chip', icon: 'mic', text: event.voice })
      const cover = findAsset(story.assets, event.cover)
      if (cover?.url) blocks.push({ type: 'figure', url: cover.url })
      else if (event.cover) blocks.push({ type: 'attrs', value: { Cover: event.cover } })
      if (isPlainObject(event.attributes))
        blocks.push({ type: 'attrs', value: event.attributes })
      push(blocks, event.error ? { type: 'error', text: event.error } : undefined)
      return blocks
    }
    case 'delete':
      return event.error ? [{ type: 'error', text: event.error }] : []
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

export function eventLead(event: StoryEvent): string {
  switch (event.type) {
    case 'input':
    case 'output':
      return event.text
    case 'dialogue':
      return event.speaker || event.background
    case 'image':
    case 'video':
    case 'card':
      return event.name
    case 'delete':
      return formatRanges(event.indices)
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

export function eventIcon(event: StoryEvent): IconName | undefined {
  switch (event.type) {
    case 'input':
    case 'output':
    case 'dialogue':
      return undefined
    case 'image':
      return 'image'
    case 'video':
      return 'play'
    case 'card':
      return 'albums'
    case 'delete':
      return 'trash'
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

export function assetOf(story: Story, name?: string | null): Asset | undefined {
  return findAsset(story.assets, name)
}
