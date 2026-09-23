import {
  AudioLines,
  PlayingCard,
  Image as ImageIcon,
  MessageCircle,
  MessageSquare,
  Trash,
  User,
  Play,
  createElement,
  type IconNode,
} from 'lucide'
import { formatRanges } from '@/project'
import { isPlainObject } from '@/records'
import type { Asset, Attributes, Card, Scene, Story, StoryEvent } from '@/types'
import { renderAttrs } from './attrs'
import { escapeHtml } from './html'

type DetailBlock =
  | { type: 'quote'; text: string }
  | { type: 'voice'; name: string }
  | { type: 'speaker'; name: string }
  | { type: 'meta'; text: string }
  | { type: 'error'; text: string }
  | { type: 'swatch'; color: string }
  | { type: 'figure'; url: string; label?: string }
  | { type: 'frames'; items: { url: string; label: string }[] }
  | { type: 'refs'; items: { url?: string; label: string }[] }
  | { type: 'attrs'; value: Attributes }

function icon(node: IconNode): string {
  return createElement(node, { width: '18', height: '18', 'aria-hidden': 'true' })
    .outerHTML
}

function richText(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*\*([^*]+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
}

function findAsset(story: Story, name?: string | null): Asset | undefined {
  if (typeof name !== 'string' || !name) return undefined
  return story.assets.find((item) => item.name.toLowerCase() === name.toLowerCase())
}

function mediaSrc(url: string, cacheBuster: number): string {
  return `${escapeHtml(url)}?v=${cacheBuster}`
}

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

function refBlock(
  story: Story,
  names: string[] | undefined,
  cacheBuster: number,
): DetailBlock | undefined {
  if (!names || names.length === 0) return undefined
  const items = names.map((name) => {
    const url = findAsset(story, name)?.url
    return { label: name, ...(url ? { url: mediaSrc(url, cacheBuster) } : {}) }
  })
  return { type: 'refs', items }
}

function frameBlock(
  story: Story,
  first: string | undefined,
  last: string | undefined,
  cacheBuster: number,
): DetailBlock | undefined {
  const items = [
    { label: 'First', name: first },
    { label: 'Last', name: last },
  ].flatMap((frame) => {
    const url = findAsset(story, frame.name)?.url
    return url ? [{ label: frame.label, url: mediaSrc(url, cacheBuster) }] : []
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
  },
  cacheBuster: number,
  frames?: DetailBlock,
): DetailBlock[] {
  const blocks: DetailBlock[] = []
  push(blocks, sizeBlock(media.width, media.height))
  if (media.dominantColor) blocks.push({ type: 'swatch', color: media.dominantColor })
  if (media.type === 'video' && media.duration)
    blocks.push({ type: 'meta', text: `${media.duration}s` })
  push(blocks, frames)
  push(blocks, refBlock(story, media.references, cacheBuster))
  if (isPlainObject(media.prompt)) blocks.push({ type: 'attrs', value: media.prompt })
  return blocks
}

function assetBlocks(
  story: Story,
  asset: Asset | undefined,
  cacheBuster: number,
): DetailBlock[] {
  if (!asset) return []
  return mediaBlocks(
    story,
    asset,
    cacheBuster,
    asset.type === 'video'
      ? frameBlock(story, asset.firstFrame, asset.lastFrame, cacheBuster)
      : undefined,
  )
}

function figureHtml(block: Extract<DetailBlock, { type: 'figure' }>): string {
  return `<figure class="detail-figure"><img src="${block.url}" alt="" />${
    block.label ? `<figcaption>${escapeHtml(block.label)}</figcaption>` : ''
  }</figure>`
}

function stillHtml(
  story: Story,
  event: Extract<StoryEvent, { type: 'image' | 'video' }>,
  asset: Asset | undefined,
  cacheBuster: number,
): string {
  if (asset?.url) {
    const src = mediaSrc(asset.url, cacheBuster)
    const media =
      event.type === 'video'
        ? `<video class="detail-video" src="${src}" preload="metadata" playsinline controls></video>`
        : figureHtml({ type: 'figure', url: src })
    return `<div class="event-still">${media}</div>`
  }
  if (event.type !== 'video') return ''
  const name = event.firstFrame ?? event.lastFrame
  const url = findAsset(story, name)?.url
  if (!url) return ''
  return `<div class="event-still">${figureHtml({
    type: 'figure',
    url: mediaSrc(url, cacheBuster),
    label: event.firstFrame ? 'First' : 'Last',
  })}</div>`
}

function renderBlocks(blocks: DetailBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'quote':
          return `<p class="detail-quote">${richText(block.text)}</p>`
        case 'voice':
          return `<div class="detail-chip">${icon(AudioLines)}<span>${escapeHtml(block.name)}</span></div>`
        case 'speaker':
          return `<div class="detail-chip">${icon(User)}<span>${escapeHtml(block.name)}</span></div>`
        case 'meta':
          return `<p class="detail-meta">${escapeHtml(block.text)}</p>`
        case 'error':
          return `<p class="detail-error">${escapeHtml(block.text)}</p>`
        case 'swatch':
          return `<div class="detail-chip"><i class="detail-swatch" style="background:${escapeHtml(block.color)}"></i><span>${escapeHtml(block.color)}</span></div>`
        case 'figure':
          return figureHtml(block)
        case 'frames':
          return `<div class="detail-frames">${block.items
            .map(
              (item) =>
                `<figure class="detail-figure"><img src="${item.url}" alt="" /><figcaption>${escapeHtml(item.label)}</figcaption></figure>`,
            )
            .join('')}</div>`
        case 'refs':
          return `<div class="detail-group"><h3>References</h3><div class="detail-refs">${block.items
            .map((item) =>
              item.url
                ? `<img src="${item.url}" alt="${escapeHtml(item.label)}" title="${escapeHtml(item.label)}" />`
                : `<span class="detail-ref">${escapeHtml(item.label)}</span>`,
            )
            .join('')}</div></div>`
        case 'attrs':
          return renderAttrs(block.value)
        default: {
          const _exhaustive: never = block
          return _exhaustive
        }
      }
    })
    .join('')
}

function detailHtml(blocks: DetailBlock[]): string {
  if (blocks.length === 0) return ''
  return `<div class="detail">${renderBlocks(blocks)}</div>`
}

function eventLead(event: StoryEvent): string {
  switch (event.type) {
    case 'message':
      return ''
    case 'image':
    case 'video':
    case 'card':
      return event.name
    case 'dialogue':
      return event.speaker || event.background
    case 'delete':
      return formatRanges(event.indices)
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

function eventIcon(event: StoryEvent): IconNode {
  switch (event.type) {
    case 'message':
      return MessageSquare
    case 'image':
      return ImageIcon
    case 'dialogue':
      return MessageCircle
    case 'video':
      return Play
    case 'card':
      return PlayingCard
    case 'delete':
      return Trash
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

function stillBlocks(
  story: Story,
  event: Extract<StoryEvent, { type: 'image' | 'video' }>,
  asset: Asset | undefined,
  cacheBuster: number,
): DetailBlock[] {
  let frames: DetailBlock | undefined
  if (event.type === 'video' && asset?.url) {
    frames = frameBlock(story, event.firstFrame, event.lastFrame, cacheBuster)
  } else if (
    event.type === 'video' &&
    event.firstFrame &&
    event.lastFrame &&
    !asset?.url
  ) {
    const url = findAsset(story, event.lastFrame)?.url
    if (url) frames = { type: 'figure', url: mediaSrc(url, cacheBuster), label: 'Last' }
  }
  const blocks = mediaBlocks(story, event, cacheBuster, frames)
  push(blocks, placementBlock(event))
  push(blocks, event.error ? { type: 'error', text: event.error } : undefined)
  return blocks
}

function eventBody(
  story: Story,
  event: StoryEvent,
  cacheBuster: number,
): { still: string; blocks: DetailBlock[] } {
  switch (event.type) {
    case 'message':
      return { still: '', blocks: [] }
    case 'image':
    case 'video': {
      const asset = findAsset(story, event.name)
      return {
        still: stillHtml(story, event, asset, cacheBuster),
        blocks: stillBlocks(story, event, asset, cacheBuster),
      }
    }
    case 'dialogue': {
      const blocks: DetailBlock[] = []
      if (event.caption) blocks.push({ type: 'quote', text: event.caption })
      push(blocks, placementBlock(event))
      push(blocks, event.error ? { type: 'error', text: event.error } : undefined)
      return { still: '', blocks }
    }
    case 'card': {
      const blocks: DetailBlock[] = []
      if (event.voice) blocks.push({ type: 'voice', name: event.voice })
      const cover = findAsset(story, event.cover)
      if (cover?.url)
        blocks.push({ type: 'figure', url: mediaSrc(cover.url, cacheBuster) })
      else if (event.cover) blocks.push({ type: 'attrs', value: { Cover: event.cover } })
      if (isPlainObject(event.attributes))
        blocks.push({ type: 'attrs', value: event.attributes })
      push(blocks, event.error ? { type: 'error', text: event.error } : undefined)
      return { still: '', blocks }
    }
    case 'delete':
      return {
        still: '',
        blocks: event.error ? [{ type: 'error', text: event.error }] : [],
      }
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

function relatedCard(story: Story, scene: Scene): Card | undefined {
  if (scene.type === 'dialogue' && scene.speaker) {
    const speaker = story.cards.find(
      (card) => card.name.toLowerCase() === scene.speaker?.toLowerCase(),
    )
    if (speaker) return speaker
  }
  const name = scene.type === 'dialogue' ? scene.background : scene.name
  return story.cards.find(
    (card) =>
      card.cover?.toLowerCase() === name.toLowerCase() ||
      card.name.toLowerCase() === name.toLowerCase(),
  )
}

export function sceneDetailHtml(story: Story, scene: Scene, cacheBuster: number): string {
  const name = scene.type === 'dialogue' ? scene.background : scene.name
  const asset = findAsset(story, name)
  const card = relatedCard(story, scene)
  const source = story.events[scene.event]
  const fromEvent =
    source && (source.type === 'image' || source.type === 'video') ? source : undefined
  const media = asset
    ? {
        ...asset,
        ...(fromEvent?.width !== undefined ? { width: fromEvent.width } : {}),
        ...(fromEvent?.height !== undefined ? { height: fromEvent.height } : {}),
        ...(fromEvent?.dominantColor ? { dominantColor: fromEvent.dominantColor } : {}),
      }
    : fromEvent
  const blocks: DetailBlock[] = []
  if (scene.type === 'dialogue' && scene.speaker && scene.speaker !== name)
    blocks.push({ type: 'speaker', name: scene.speaker })
  if (scene.type === 'dialogue' && scene.caption)
    blocks.push({ type: 'quote', text: scene.caption })
  if (
    scene.type === 'dialogue' &&
    scene.speech?.words?.length &&
    scene.speech.words.join(' ') !== scene.caption
  ) {
    blocks.push({ type: 'meta', text: scene.speech.words.join(' ') })
  }
  if (card?.voice) blocks.push({ type: 'voice', name: card.voice })
  blocks.push(...assetBlocks(story, media, cacheBuster))
  if (card?.attributes) blocks.push({ type: 'attrs', value: card.attributes })
  return `<div class="detail-title">${escapeHtml(name)}</div>${detailHtml(blocks)}`
}

function sceneByEvent(story: Story): (number | undefined)[] {
  const byEvent: (number | undefined)[] = []
  story.scenes.forEach((scene, index) => {
    byEvent[scene.event] = index
  })
  return byEvent
}

export function logHtml(story: Story, cacheBuster: number): string {
  const scenes = sceneByEvent(story)
  return story.events
    .map((event, index) => renderEvent(story, event, index, scenes[index], cacheBuster))
    .join('')
}

function renderEvent(
  story: Story,
  event: StoryEvent,
  index: number,
  scene: number | undefined,
  cacheBuster: number,
): string {
  const sceneAttr = scene === undefined ? '' : ` data-scene="${scene}"`
  if (event.type === 'message') {
    const error = event.error
      ? `<p class="detail-error">${escapeHtml(event.error)}</p>`
      : ''
    const body = event.user
      ? `<div class="pillow user-msg" data-at="${index}">${escapeHtml(event.text)}</div>`
      : escapeHtml(event.text)
    const user = event.user ? ' event-user' : ''
    return `<div class="event event-message${user}${event.error ? ' event-error' : ''}" data-event="${index}">${body}${error}</div>`
  }
  const lead = eventLead(event)
  const line = `<span class="event-line"><span class="event-type" title="${event.type}">${icon(eventIcon(event))}</span>${
    lead ? `<span class="event-label">${escapeHtml(lead)}</span>` : ''
  }</span>`
  const { still, blocks } = eventBody(story, event, cacheBuster)
  const cls = `event event-${event.type}${event.error ? ' event-error' : ''}${still ? ' has-still' : ''}`
  if (blocks.length === 0 && !still) {
    return `<div class="${cls}" data-event="${index}"${sceneAttr}>${line}</div>`
  }
  return `<details class="${cls}" data-event="${index}"${sceneAttr}><summary>${still}${line}</summary>${detailHtml(blocks)}</details>`
}
