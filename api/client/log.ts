import {
  formatRanges,
  isPlainObject,
  type Asset,
  type Attributes,
  type Card,
  type Scene,
  type Story,
  type StoryEvent,
} from 'shared'
import { renderAttrs } from './attrs'
import { avatarHtml, portraitUrl } from './avatar'
import { stripSpeechTags } from './caption'
import { escapeHtml, icon, richText } from './html'

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

function imageThumb(
  story: Story,
  event: Extract<StoryEvent, { type: 'image' }>,
  cacheBuster: number,
): string | undefined {
  const asset = findAsset(story, event.name)
  if (!asset?.url) return undefined
  const width = asset.width ?? event.width
  const height = asset.height ?? event.height
  const size =
    width && height ? ` width="${Math.round(width)}" height="${Math.round(height)}"` : ''
  return `<img class="event-thumb" src="${mediaSrc(asset.url, cacheBuster)}"${size} alt="" />`
}

function figureHtml(block: Extract<DetailBlock, { type: 'figure' }>): string {
  return `<figure class="detail-figure"><img src="${block.url}" alt="" />${
    block.label ? `<figcaption>${escapeHtml(block.label)}</figcaption>` : ''
  }</figure>`
}

function renderBlocks(blocks: DetailBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'quote':
          return `<p class="detail-quote">${richText(block.text)}</p>`
        case 'voice':
          return `<div class="detail-chip">${icon('mic')}<span>${escapeHtml(block.name)}</span></div>`
        case 'speaker':
          return `<div class="detail-chip">${icon('person-outline')}<span>${escapeHtml(block.name)}</span></div>`
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

function dialogueCopy(caption: string): string {
  return richText(stripSpeechTags(caption))
}

function eventLead(
  event: Extract<StoryEvent, { type: 'video' | 'card' | 'delete' }>,
): string {
  switch (event.type) {
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

function eventIcon(
  event: Extract<StoryEvent, { type: 'video' | 'card' | 'delete' }>,
): string {
  switch (event.type) {
    case 'video':
      return 'play'
    case 'card':
      return 'scan-outline'
    case 'delete':
      return 'trash-outline'
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
  const blocks = mediaBlocks(story, event, cacheBuster)
  push(blocks, placementBlock(event))
  push(blocks, event.error ? { type: 'error', text: event.error } : undefined)
  return blocks
}

function videoStill(asset: Asset | undefined, cacheBuster: number): string {
  if (!asset?.url) return ''
  const src = mediaSrc(asset.url, cacheBuster)
  return `<div class="event-still"><video class="detail-video" src="${src}" preload="metadata" playsinline controls></video></div>`
}

function eventBody(
  story: Story,
  event: Extract<StoryEvent, { type: 'video' | 'card' | 'delete' }>,
  cacheBuster: number,
): { still: string; blocks: DetailBlock[] } {
  switch (event.type) {
    case 'video': {
      const asset = findAsset(story, event.name)
      return {
        still: videoStill(asset, cacheBuster),
        blocks: stillBlocks(story, event, asset, cacheBuster),
      }
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

export function logHtml(
  story: Story,
  cacheBuster: number,
  faces: Map<string, string>,
): string {
  const scenes = sceneByEvent(story)
  return story.events
    .map((event, index) =>
      renderEvent(story, event, index, scenes[index], cacheBuster, faces),
    )
    .join('')
}

function sceneAttr(scene: number | undefined): string {
  return scene === undefined ? '' : ` data-scene="${scene}"`
}

function dialogueEvent(
  event: Extract<StoryEvent, { type: 'dialogue' }>,
  index: number,
  scene: number | undefined,
  cacheBuster: number,
  faces: Map<string, string>,
): string {
  const lead = event.speaker || event.background
  const copy = event.caption
    ? `<p class="event-copy">${dialogueCopy(event.caption)}</p>`
    : ''
  const blocks: DetailBlock[] = []
  push(blocks, placementBlock(event))
  push(blocks, event.error ? { type: 'error', text: event.error } : undefined)
  const detail = detailHtml(blocks)
  const fold = copy || detail ? ' data-fold' : ''
  const cls = `event event-dialogue${event.error ? ' event-error' : ''}`
  return `<div class="${cls}" data-event="${index}"${sceneAttr(scene)}${fold}><span class="event-type" title="dialogue">${avatarHtml(lead, portraitUrl(faces, lead), cacheBuster)}</span><span class="event-label">${escapeHtml(lead)}</span>${copy}${detail}</div>`
}

function imageEvent(
  story: Story,
  event: Extract<StoryEvent, { type: 'image' }>,
  index: number,
  scene: number | undefined,
  cacheBuster: number,
): string {
  const asset = findAsset(story, event.name)
  const thumb = imageThumb(story, event, cacheBuster)
  const mark =
    thumb ?? `<span class="event-type" title="image">${icon('image-outline')}</span>`
  const detail = detailHtml(stillBlocks(story, event, asset, cacheBuster))
  const fold = thumb || detail ? ' data-fold' : ''
  const cls = `event event-image${event.error ? ' event-error' : ''}`
  return `<div class="${cls}" data-event="${index}"${sceneAttr(scene)}${fold}>${mark}<span class="event-label">${escapeHtml(event.name)}</span>${detail}</div>`
}

function foldedEvent(
  story: Story,
  event: Extract<StoryEvent, { type: 'video' | 'card' | 'delete' }>,
  index: number,
  scene: number | undefined,
  cacheBuster: number,
): string {
  const lead = eventLead(event)
  const { still, blocks } = eventBody(story, event, cacheBuster)
  const title = escapeHtml(lead)
  const fold = `${still}${detailHtml(blocks)}`
  const name = fold
    ? `<details><summary class="event-label">${title}</summary>${fold}</details>`
    : title
      ? `<span class="event-label">${title}</span>`
      : ''
  const line = `<span class="event-line"><span class="event-type" title="${event.type}">${icon(eventIcon(event))}</span>${name}</span>`
  const cls = `event event-${event.type}${event.error ? ' event-error' : ''}`
  return `<div class="${cls}" data-event="${index}"${sceneAttr(scene)}>${line}</div>`
}

function renderEvent(
  story: Story,
  event: StoryEvent,
  index: number,
  scene: number | undefined,
  cacheBuster: number,
  faces: Map<string, string>,
): string {
  switch (event.type) {
    case 'message': {
      const error = event.error
        ? `<p class="detail-error">${escapeHtml(event.error)}</p>`
        : ''
      const body = event.user
        ? `<div class="pillow user-msg" data-at="${index}">${escapeHtml(event.text)}</div>`
        : escapeHtml(event.text)
      const user = event.user ? ' event-user' : ''
      const cls = `event event-message${user}${event.error ? ' event-error' : ''}`
      return `<div class="${cls}" data-event="${index}">${body}${error}</div>`
    }
    case 'dialogue':
      return dialogueEvent(event, index, scene, cacheBuster, faces)
    case 'image':
      return imageEvent(story, event, index, scene, cacheBuster)
    case 'video':
    case 'card':
    case 'delete':
      return foldedEvent(story, event, index, scene, cacheBuster)
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}
