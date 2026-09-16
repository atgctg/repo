import type { Card, MediaAsset, Slide, Story, StorySummary } from './types'
import { resolveSlides } from './slides'

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

function renderGenerateBtn(storyId: string, asset?: MediaAsset): string {
  if (!canGenerate(asset) || !asset) return ''
  return `<button type="button" class="gen-btn" data-story="${escapeHtml(storyId)}" data-name="${escapeHtml(asset.name)}">Generate</button>`
}

function getDialogueSizeClass(text: string): string {
  const clean = text.replace(/\*/g, '').trim()
  const len = clean.length
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
  const hasDialogue = Boolean(slide.dialogue?.trim())
  const hasSpeaker = Boolean(slide.speaker?.trim())

  const mediaAsset = findImage(media, slide.background)
  const hasImage = Boolean(mediaAsset?.key)
  const imgBgHtml = hasImage ? `<img class="card-img" src="${escapeHtml(mediaAsset!.key!)}?v=${cacheBuster}" alt="" />` : ''

  const dialogueHtml = hasDialogue
    ? `<div class="dialogue ${getDialogueSizeClass(slide.dialogue!)}">${formatDialogue(slide.dialogue!)}</div>`
    : ''

  const initial = hasSpeaker ? escapeHtml(slide.speaker!.trim()[0]?.toUpperCase() ?? '') : ''
  const speakerHtml = hasSpeaker
    ? `<div class="speaker"><span class="avatar"><span class="avatar-letter">${initial}</span></span><span>${escapeHtml(slide.speaker!)}</span></div>`
    : ''

  const bgOnlyHtml =
    !hasDialogue && !hasSpeaker && slide.background
      ? `<div class="bg-title">${escapeHtml(slide.background)}</div>`
      : ''

  const cardClasses = ['card', hasImage ? 'has-image' : ''].filter(Boolean).join(' ')

  return `
    <div class="${cardClasses}">
      ${imgBgHtml}
      ${bgOnlyHtml}
      ${dialogueHtml}
      ${speakerHtml}
      ${!hasDialogue && !hasSpeaker ? renderGenerateBtn(storyId, mediaAsset) : ''}
    </div>
  `
}

function formatAttrValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(', ')
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => `${key}: ${formatAttrValue(nested)}`)
      .join('\n')
  }
  return ''
}

function renderCard(card: Card, media: Story['media'], storyId: string): string {
  const mediaAsset = findImage(media, card.cover)
  const hasImage = Boolean(mediaAsset?.key)
  const imgBgHtml = hasImage ? `<img class="card-img" src="${escapeHtml(mediaAsset!.key!)}?v=${cacheBuster}" alt="" />` : ''

  const attrs = Object.entries(card.attributes ?? {})
  const attrsHtml = attrs
    .map(
      ([key, value]) => `
        <div class="card-attr">
          <div class="card-attr-key">${escapeHtml(key)}</div>
          <div class="card-attr-value">${escapeHtml(formatAttrValue(value))}</div>
        </div>
      `,
    )
    .join('')

  const cardClasses = ['card', hasImage ? 'has-image' : ''].filter(Boolean).join(' ')

  return `
    <div class="${cardClasses}">
      ${imgBgHtml}
      <div class="bg-title">${escapeHtml(card.name)}</div>
      <div class="card-attrs">${attrsHtml}</div>
      ${renderGenerateBtn(storyId, mediaAsset)}
    </div>
  `
}

function renderMedia(asset: MediaAsset, storyId: string): string {
  const hasImage = asset.type === 'image' && Boolean(asset.key)
  const imgBgHtml = hasImage ? `<img class="card-img" src="${escapeHtml(asset.key!)}?v=${cacheBuster}" alt="" />` : ''

  const attrs = Object.entries(asset.prompt ?? {})
  const attrsHtml = attrs
    .map(
      ([key, value]) => `
        <div class="card-attr">
          <div class="card-attr-key">${escapeHtml(key)}</div>
          <div class="card-attr-value">${escapeHtml(formatAttrValue(value))}</div>
        </div>
      `,
    )
    .join('')

  const cardClasses = ['card', hasImage ? 'has-image' : ''].filter(Boolean).join(' ')

  const canPrompt = canPromptImage(asset)
  const btnHtml = canPrompt
    ? `<button type="button" class="gen-btn ${hasImage ? 'regen-btn' : ''}" data-story="${escapeHtml(storyId)}" data-name="${escapeHtml(asset.name)}">${hasImage ? 'Regenerate' : 'Generate'}</button>`
    : ''

  return `
    <div class="${cardClasses}">
      ${imgBgHtml}
      <div class="bg-title">${escapeHtml(asset.name)}</div>
      <div class="card-attrs">
        <div class="card-attr">
          <div class="card-attr-key">type</div>
          <div class="card-attr-value">${escapeHtml(asset.type)}</div>
        </div>
        ${attrsHtml}
      </div>
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
          <div class="bg-title">${escapeHtml(title)}</div>
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
      return story.slides.length
    case 'cards':
      return story.cards.length
    case 'media':
      return story.media.length
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
      if (!story.slides.length) {
        main.className = 'list'
        main.innerHTML = '<span class="muted">no slides</span>'
        break
      }
      main.className = 'grid'
      main.innerHTML = resolveSlides(story.slides)
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
  button.textContent = 'Generating…'
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
    button.textContent = message
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
