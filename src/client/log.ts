import {
  IdCard,
  Image as ImageIcon,
  MessageSquare,
  MessageSquareText,
  Trash,
  Video,
  createElement,
  type IconNode,
} from 'lucide'
import { formatRanges } from '@/project'
import type { Attributes, Story, StoryEvent } from '@/types'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function icon(node: IconNode): string {
  return createElement(node, { width: '18', height: '18', 'aria-hidden': 'true' })
    .outerHTML
}

function findAsset(story: Story, name?: string | null): string | undefined {
  if (typeof name !== 'string' || !name) return undefined
  return story.assets.find((item) => item.name.toLowerCase() === name.toLowerCase())?.url
}

function thumb(url: string | undefined, cacheBuster: number, avatar: boolean): string {
  if (!url) return ''
  const cls = avatar ? 'event-avatar' : 'event-thumb'
  return `<img class="${cls}" src="${escapeHtml(url)}?v=${cacheBuster}" alt="" />`
}

function field(
  label: string,
  value: string | number | boolean | null | undefined,
): string {
  if (value === undefined || value === null || value === '') return ''
  return `<div class="event-field"><span class="event-key">${escapeHtml(label)}</span><span>${escapeHtml(String(value))}</span></div>`
}

function jsonBlock(value: Attributes | undefined): string {
  if (!value || Object.keys(value).length === 0) return ''
  return `<pre class="event-json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`
}

function placement(event: { index?: number; replace?: boolean }): string {
  return [field('index', event.index), event.replace ? field('replace', 'yes') : ''].join(
    '',
  )
}

function speakerAvatar(
  story: Story,
  speaker: string | undefined,
  cacheBuster: number,
): string {
  if (!speaker) return ''
  const card = story.cards.find(
    (item) => item.name.toLowerCase() === speaker.toLowerCase(),
  )
  return thumb(findAsset(story, card?.cover), cacheBuster, true)
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
  selected: ReadonlySet<number>,
  cacheBuster: number,
): string {
  const scenes = sceneByEvent(story)
  return story.events
    .map((event, index) =>
      renderEvent(story, event, index, scenes[index], selected, cacheBuster),
    )
    .join('')
}

function renderEvent(
  story: Story,
  event: StoryEvent,
  index: number,
  scene: number | undefined,
  selected: ReadonlySet<number>,
  cacheBuster: number,
): string {
  const sceneAttr = scene === undefined ? '' : ` data-scene="${scene}"`
  const selectedClass = scene !== undefined && selected.has(scene) ? ' is-selected' : ''
  let mark = ''
  let lead = ''
  let avatar = ''
  let picture = ''
  let body = ''
  let extra = ''
  switch (event.type) {
    case 'message':
      mark = icon(MessageSquare)
      body = event.user
        ? `<button type="button" class="event-copy rewind" data-at="${index}">${escapeHtml(event.text)}</button>`
        : `<div class="event-copy">${escapeHtml(event.text)}</div>`
      extra = field('error', event.error)
      break
    case 'image':
      mark = icon(ImageIcon)
      lead = event.name
      picture = thumb(findAsset(story, event.name), cacheBuster, false)
      extra = [
        field('references', event.references?.join(', ')),
        placement(event),
        field('width', event.width),
        field('height', event.height),
        field('color', event.dominantColor),
        field('error', event.error),
        jsonBlock(event.prompt),
      ].join('')
      break
    case 'dialogue':
      mark = icon(MessageSquareText)
      lead = event.speaker ?? ''
      avatar = speakerAvatar(story, event.speaker, cacheBuster)
      body = event.caption
        ? `<div class="event-copy">${escapeHtml(event.caption)}</div>`
        : ''
      extra = [
        event.speaker || event.caption ? field('background', event.background) : '',
        placement(event),
        field('error', event.error),
      ].join('')
      break
    case 'video':
      mark = icon(Video)
      lead = event.name
      picture = thumb(
        event.firstFrame ? findAsset(story, event.firstFrame) : undefined,
        cacheBuster,
        false,
      )
      extra = [
        field('first frame', event.firstFrame),
        field('last frame', event.lastFrame),
        field('duration', event.duration),
        field('references', event.references?.join(', ')),
        placement(event),
        field('width', event.width),
        field('height', event.height),
        field('color', event.dominantColor),
        field('error', event.error),
        jsonBlock(event.prompt),
      ].join('')
      break
    case 'card':
      mark = icon(IdCard)
      lead = event.name
      avatar = thumb(findAsset(story, event.cover), cacheBuster, true)
      extra = [
        field('cover', event.cover),
        field('voice', event.voice),
        field('error', event.error),
        jsonBlock(event.attributes),
      ].join('')
      break
    case 'delete':
      mark = icon(Trash)
      lead = formatRanges(event.indices)
      extra = field('error', event.error)
      break
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
  const who = `${avatar}${lead ? `<span class="event-label">${escapeHtml(lead)}</span>` : ''}`
  const head = `<span class="event-head"><span class="event-type" title="${event.type}">${mark}</span>${who ? `<span class="event-who">${who}</span>` : ''}${picture}</span>`
  const shown = `${head}${body}`
  const cls = `event event-${event.type}${event.error ? ' event-error' : ''}${selectedClass}`
  if (!extra)
    return `<div class="${cls}" data-event="${index}"${sceneAttr}>${shown}</div>`
  return `<details class="${cls}" data-event="${index}"${sceneAttr}><summary>${shown}</summary><div class="event-body">${extra}</div></details>`
}
