import { stringify } from 'yaml'
import { isPlainObject } from '../attributes'
import type { Card, MediaAsset, Slide, Story, StorySummary } from '../types'

{
  const icon = document.createElement('link')
  icon.rel = 'icon'
  icon.type = 'image/x-icon'
  icon.href = '/favicon.ico'
  document.head.appendChild(icon)
}

let cacheBuster = Date.now()

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function findImage(media: Story['media'], name?: string): MediaAsset | undefined {
  if (!name) return undefined
  return media.find((item) => item.type === 'image' && item.name.toLowerCase() === name.toLowerCase())
}

function canGenerate(asset?: MediaAsset): boolean {
  return Boolean(asset && asset.type === 'image' && !asset.key && asset.prompt && Object.keys(asset.prompt).length > 0)
}

function canPromptImage(asset?: MediaAsset): boolean {
  return Boolean(asset && asset.type === 'image' && asset.prompt && Object.keys(asset.prompt).length > 0)
}

function formatPromptYaml(prompt?: Record<string, unknown>): string {
  if (!prompt || Object.keys(prompt).length === 0) return ''
  return stringify(prompt, { indent: 2 }).trim()
}

const REFRESH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`

function renderGenerateBtn(storyId: string, asset?: MediaAsset): string {
  if (!canGenerate(asset) || !asset) return ''
  return `<button type="button" class="gen-btn" data-story="${escapeHtml(storyId)}" data-name="${escapeHtml(asset.name)}">Generate</button>`
}

function getDialogueLines(dialogue?: string | string[]): string[] {
  if (!dialogue) return []
  const rawList = Array.isArray(dialogue) ? dialogue : [dialogue]
  return rawList
    .flatMap((item) => String(item).split(/\n\n+/))
    .map((line) => line.trim())
    .filter(Boolean)
}

function getDialogueSizeClass(lines: string[]): string {
  const totalClean = lines.map((l) => l.replace(/\*/g, '').trim())
  const totalLen = totalClean.reduce((sum, l) => sum + l.length, 0)
  const count = lines.length

  if (count > 1) {
    if (totalLen <= 60) return 'dialogue-md'
    if (totalLen <= 120) return 'dialogue-sm'
    return 'dialogue-xs'
  }

  const len = totalClean[0]?.length ?? 0
  if (len <= 25) return 'dialogue-xl'
  if (len <= 50) return 'dialogue-lg'
  if (len <= 90) return 'dialogue-md'
  if (len <= 140) return 'dialogue-sm'
  return 'dialogue-xs'
}

function formatDialogue(text: string): string {
  const escaped = escapeHtml(text)
  return escaped
    .replace(/\*\*\*([^*]+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
}

function renderSlide(slide: Slide, media: Story['media'], storyId: string): string {
  const lines = getDialogueLines(slide.dialogue)
  const hasDialogue = lines.length > 0
  const hasSpeaker = Boolean(slide.speaker?.trim())

  const mediaAsset = findImage(media, slide.background)
  const hasImage = Boolean(mediaAsset?.key)
  const imgBgHtml = hasImage ? `<img class="card-img" src="${escapeHtml(mediaAsset!.key!)}?v=${cacheBuster}" alt="" />` : ''

  const totalLen = lines.reduce((sum, l) => sum + l.replace(/\*/g, '').trim().length, 0)
  const isLeft = lines.length > 1 || totalLen > 120

  const dialogueLinesHtml = lines
    .map((l) => `<div class="dialogue-line">${formatDialogue(l)}</div>`)
    .join('')

  const classes = [
    'dialogue',
    getDialogueSizeClass(lines),
    isLeft ? 'dialogue-left' : '',
  ].filter(Boolean).join(' ')

  const dialogueHtml = hasDialogue
    ? `<div class="${classes}">${dialogueLinesHtml}</div>`
    : ''

  const initial = hasSpeaker ? escapeHtml(slide.speaker!.trim()[0]?.toUpperCase() ?? '') : ''
  const speakerHtml = hasSpeaker
    ? `<div class="speaker"><span class="avatar"><span class="avatar-letter">${initial}</span></span><span>${escapeHtml(slide.speaker!)}</span></div>`
    : ''

  const titleHtml =
    !hasDialogue && !hasSpeaker && slide.background
      ? `<div class="card-title">${escapeHtml(slide.background)}</div>`
      : ''

  const cardClasses = ['card', hasImage ? 'has-image' : ''].filter(Boolean).join(' ')

  return `
    <div class="${cardClasses}">
      ${imgBgHtml}
      ${titleHtml}
      ${dialogueHtml}
      ${speakerHtml}
      ${!hasDialogue && !hasSpeaker ? renderGenerateBtn(storyId, mediaAsset) : ''}
    </div>
  `
}

function hideAttrLabel(label: string): boolean {
  return label === '' || /^\d+$/.test(label)
}

function attrEntries(value: unknown): [string, unknown][] | null {
  if (isPlainObject(value)) return Object.entries(value)
  if (Array.isArray(value)) return value.map((item, i) => [String(i), item])
  return null
}

function sortAttrEntries(entries: [string, unknown][]): [string, unknown][] {
  return [...entries].sort(([, a], [, b]) => {
    const aGroup = isPlainObject(a) || Array.isArray(a)
    const bGroup = isPlainObject(b) || Array.isArray(b)
    if (aGroup === bGroup) return 0
    return aGroup ? 1 : -1
  })
}

function renderAttrTile(label: string, value: unknown): string {
  const valueStr = Array.isArray(value) ? value.map(String).join(' ') : String(value ?? '')
  const wide = valueStr.length > 42
  const showLabel = !hideAttrLabel(label)
  return `<div class="attr-tile${wide ? ' attr-wide' : ''}">${
    showLabel ? `<div class="attr-key">${escapeHtml(label)}</div>` : ''
  }<div class="attr-val">${escapeHtml(valueStr)}</div></div>`
}

function renderAttrNode(label: string, value: unknown, level: number): string {
  const entries = attrEntries(value)
  if (!entries || entries.length === 0) {
    if (isPlainObject(value) || Array.isArray(value)) return ''
    return renderAttrTile(label, value)
  }

  const kids = sortAttrEntries(entries)
    .map(([key, child]) => renderAttrNode(key, child, level + 1))
    .join('')
  const showLabel = !hideAttrLabel(label)

  if (level === 0) return kids

  return `<div class="attr-section">${
    showLabel ? `<div class="attr-label">${escapeHtml(label)}</div>` : ''
  }<div class="attr-row">${kids}</div></div>`
}

function renderCardAttrs(attributes: Record<string, unknown>): string {
  const inner = renderAttrNode('', attributes, 0)
  if (!inner) return ''
  return `<div class="card-attrs">${inner}</div>`
}

function renderCard(card: Card, media: Story['media'], storyId: string): string {
  const mediaAsset = findImage(media, card.cover)
  const hasImage = Boolean(mediaAsset?.key)
  const imgBgHtml = hasImage ? `<img class="card-img" src="${escapeHtml(mediaAsset!.key!)}?v=${cacheBuster}" alt="" />` : ''
  const attrsHtml = renderCardAttrs(card.attributes ?? {})
  const cardClasses = ['card', hasImage ? 'has-image' : ''].filter(Boolean).join(' ')

  return `
    <div class="${cardClasses}">
      ${imgBgHtml}
      <div class="card-title">${escapeHtml(card.name)}</div>
      ${attrsHtml}
      ${renderGenerateBtn(storyId, mediaAsset)}
    </div>
  `
}

function renderMedia(asset: MediaAsset, storyId: string): string {
  const hasImage = asset.type === 'image' && Boolean(asset.key)
  const imgBgHtml = hasImage ? `<img class="card-img" src="${escapeHtml(asset.key!)}?v=${cacheBuster}" alt="" />` : ''
  const promptYaml = formatPromptYaml(asset.prompt)
  const promptHtml = promptYaml ? `<pre class="card-prompt">${escapeHtml(promptYaml)}</pre>` : ''

  const cardClasses = ['card', 'card-media', hasImage ? 'has-image' : ''].filter(Boolean).join(' ')

  const canPrompt = canPromptImage(asset)
  const btnHtml = canPrompt
    ? hasImage
      ? `<button type="button" class="gen-btn regen-btn regen-icon" data-story="${escapeHtml(storyId)}" data-name="${escapeHtml(asset.name)}" aria-label="Regenerate" title="Regenerate">${REFRESH_ICON}</button>`
      : `<button type="button" class="gen-btn" data-story="${escapeHtml(storyId)}" data-name="${escapeHtml(asset.name)}">Generate</button>`
    : ''

  return `
    <div class="${cardClasses}">
      ${imgBgHtml}
      <div class="card-title">${escapeHtml(asset.name)}</div>
      ${promptHtml}
      ${btnHtml}
    </div>
  `
}

function renderIndex(stories: Array<string | StorySummary>): void {
  document.title = 'Studio'
  const header = document.querySelector('header')
  const main = document.querySelector('main')
  if (!header || !main) return

  header.innerHTML = `
    <span class="header-title">stories</span>
    <span class="tab-count">${stories.length}</span>
  `

  if (!stories.length) {
    main.className = 'list'
    main.innerHTML = '<span class="muted">no stories</span>'
    return
  }

  main.className = 'grid'
  main.innerHTML = stories
    .map((item) => {
      const id = typeof item === 'string' ? item : item.id
      const title = typeof item === 'string' ? item : item.title || item.id
      const cover = typeof item === 'string' ? undefined : item.cover
      const hasImage = Boolean(cover)
      const imgBgHtml = hasImage
        ? `<img class="card-img" src="${escapeHtml(cover!)}?v=${cacheBuster}" alt="" />`
        : ''

      const cardClasses = ['card', hasImage ? 'has-image' : ''].filter(Boolean).join(' ')

      return `
        <a href="/${encodeURIComponent(id)}" class="${cardClasses}">
          ${imgBgHtml}
          <div class="card-title">${escapeHtml(title)}</div>
        </a>
      `
    })
    .join('\n')
}

type StoryTab = 'slides' | 'cards' | 'media'

function getStoryTab(): StoryTab {
  const tab = new URLSearchParams(location.search).get('tab')
  if (tab === 'cards' || tab === 'media') return tab
  return 'slides'
}

function storyTabHref(storyId: string, tab: StoryTab): string {
  const path = `/${encodeURIComponent(storyId)}`
  if (tab === 'slides') return path
  return `${path}?tab=${tab}`
}

function tabLabel(tab: StoryTab): string {
  switch (tab) {
    case 'slides':
      return 'Slides'
    case 'cards':
      return 'Cards'
    case 'media':
      return 'Media'
    default: {
      const _exhaustive: never = tab
      return _exhaustive
    }
  }
}

function renderTabs(story: Story, active: StoryTab): string {
  const tabs: StoryTab[] = ['slides', 'cards', 'media']
  return `<nav class="tabs">${tabs
    .map((tab) => {
      const activeClass = tab === active ? ' tab-active' : ''
      return `<a class="tab${activeClass}" href="${storyTabHref(story.id, tab)}"><span class="tab-count">${tabCount(story, tab)}</span>${tabLabel(tab)}</a>`
    })
    .join('')}</nav>`
}

function tabCount(story: Story, tab: StoryTab): number {
  switch (tab) {
    case 'slides':
      return story.slides?.length ?? 0
    case 'cards':
      return story.cards?.length ?? 0
    case 'media':
      return story.media?.length ?? 0
    default: {
      const _exhaustive: never = tab
      return _exhaustive
    }
  }
}

function renderStory(story: Story): void {
  document.title = story.title || story.id
  const header = document.querySelector('header')
  const main = document.querySelector('main')
  if (!header || !main) return

  const tab = getStoryTab()

  header.innerHTML = `
    <a href="/" class="tab story-back"><span>←</span>${escapeHtml(story.title || story.id)}</a>
    ${renderTabs(story, tab)}
  `

  switch (tab) {
    case 'slides': {
      if (!story.slides?.length) {
        main.className = 'list'
        main.innerHTML = '<span class="muted">No slides</span>'
        break
      }
      main.className = 'grid'
      main.innerHTML = story.slides
        .map((s) => renderSlide(s, story.media, story.id))
        .join('\n')
      break
    }
    case 'cards': {
      if (!story.cards.length) {
        main.className = 'list'
        main.innerHTML = '<span class="muted">no cards</span>'
        break
      }
      main.className = 'grid'
      main.innerHTML = story.cards.map((c) => renderCard(c, story.media, story.id)).join('\n')
      break
    }
    case 'media': {
      if (!story.media.length) {
        main.className = 'list'
        main.innerHTML = '<span class="muted">no media</span>'
        break
      }
      main.className = 'grid'
      main.innerHTML = story.media.map((m) => renderMedia(m, story.id)).join('\n')
      break
    }
    default: {
      const _exhaustive: never = tab
      throw new Error(`Unhandled tab: ${_exhaustive}`)
    }
  }
}

function renderNotFound(id: string): void {
  document.title = id
  const header = document.querySelector('header')
  const main = document.querySelector('main')
  if (!header || !main) return

  header.innerHTML = `
    <a href="/" class="tab story-back"><span>←</span>${escapeHtml(id)}</a>
  `
  main.className = 'list'
  main.innerHTML = '<span class="muted">not found</span>'
}

function currentPathname(): string {
  return decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, ''))
}

function currentRoute(): string {
  return `${location.pathname}${location.search}`
}

function isSpaLink(link: HTMLAnchorElement, event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if (link.target && link.target !== '_self') return false
  if (link.hasAttribute('download')) return false
  if (link.origin !== location.origin) return false
  return true
}

function navigate(url: string): void {
  if (url === currentRoute()) return
  history.pushState(null, '', url)
  lastPayload = ''
  void refresh()
}

let lastPayload = ''
async function refresh(): Promise<void> {
  const pathname = currentPathname()
  const route = currentRoute()
  let payload: string

  if (!pathname) {
    const stories = (await fetch('/api/stories', { cache: 'no-store' }).then((res) => res.json())) as Array<
      string | StorySummary
    >
    if (currentRoute() !== route) return
    payload = JSON.stringify({ pathname, stories })
    if (payload === lastPayload) return
    lastPayload = payload
    renderIndex(stories)
    return
  }

  const res = await fetch(`/api/stories/${encodeURIComponent(pathname)}`, { cache: 'no-store' })
  if (currentRoute() !== route) return
  if (!res.ok) {
    payload = JSON.stringify({ pathname, missing: true })
    if (payload === lastPayload) return
    lastPayload = payload
    renderNotFound(pathname)
    return
  }

  const story = (await res.json()) as Story
  if (currentRoute() !== route) return
  payload = JSON.stringify({ pathname, search: location.search, story })
  if (payload === lastPayload) return
  lastPayload = payload
  renderStory(story)
}

const generating = new Set<string>()

async function generateFromButton(button: HTMLButtonElement): Promise<void> {
  const storyId = button.dataset.story
  const name = button.dataset.name
  if (!storyId || !name) return
  const job = `${storyId}:${name}`
  if (generating.has(job)) return
  generating.add(job)
  button.disabled = true
  const isIcon = button.classList.contains('regen-icon')
  if (isIcon) button.classList.add('is-generating')
  else button.textContent = 'Generating…'
  const started = performance.now()
  console.error('img gen start', { storyId, name })
  try {
    const res = await fetch(`/api/stories/${encodeURIComponent(storyId)}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `Generate failed (${res.status})`)
    }
    console.error('img gen ok', { storyId, name, ms: Math.round(performance.now() - started) })
    cacheBuster = Date.now()
    lastPayload = ''
    await refresh()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('img gen error', { storyId, name, ms: Math.round(performance.now() - started), error: message })
    button.disabled = false
    if (isIcon) {
      button.classList.remove('is-generating')
      button.title = message
    } else {
      button.textContent = message
    }
  } finally {
    generating.delete(job)
  }
}

document.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const gen = target.closest('button.gen-btn')
  if (gen instanceof HTMLButtonElement) {
    event.preventDefault()
    void generateFromButton(gen)
    return
  }
  const link = target.closest('a')
  if (!link || !isSpaLink(link, event)) return
  event.preventDefault()
  navigate(`${link.pathname}${link.search}`)
})

window.addEventListener('popstate', () => {
  lastPayload = ''
  void refresh()
})

void refresh()
setInterval(() => {
  void refresh()
}, 1000)
