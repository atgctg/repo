import { isPlainObject } from '../records'
import type { Asset, Card, ImageScene, Scene, Story, VideoScene, World } from '../types'

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

function findAsset(assets: Story['assets'], name?: string): Asset | undefined {
  if (!name) return undefined
  return assets.find((item) => item.name.toLowerCase() === name.toLowerCase())
}

function canGenerate(asset?: Asset): boolean {
  if (!asset || asset.url) return false
  return canPrompt(asset)
}

function canPrompt(asset?: Asset): boolean {
  if (!asset) return false
  switch (asset.kind) {
    case 'image':
      return Boolean(asset.prompt && Object.keys(asset.prompt).length > 0)
    case 'video':
      return Boolean(asset.prompt?.trim() || asset.firstFrame)
    default: {
      const _exhaustive: never = asset
      return _exhaustive
    }
  }
}

function speechSrc(storyId: string, file?: string): string | undefined {
  if (!file) return undefined
  return `/assets/${encodeURIComponent(storyId)}/${encodeURIComponent(file)}`
}

const REFRESH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`
const PLAY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>`
const PAUSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/></svg>`
function cardClass(hasImage: boolean, extra = ''): string {
  return ['card', extra, hasImage ? 'has-image' : ''].filter(Boolean).join(' ')
}

function imgTag(url?: string): string {
  return url ? `<img class="card-img" src="${escapeHtml(url)}?v=${cacheBuster}" alt="" />` : ''
}

function videoTag(url?: string): string {
  return url ? `<video class="card-video" src="${escapeHtml(url)}?v=${cacheBuster}" controls autoplay muted loop playsinline></video>` : ''
}

function sceneVideoTag(url?: string): string {
  return url ? `<video class="card-video" src="${escapeHtml(url)}?v=${cacheBuster}" preload="metadata" playsinline></video>` : ''
}

function playOverlayTag(audioUrl?: string): string {
  const src = audioUrl ? ` data-src="${escapeHtml(audioUrl)}?v=${cacheBuster}"` : ''
  return `<button type="button" class="play-btn play-overlay"${src} aria-label="Play" title="Play">${PLAY_ICON}</button>`
}

let voiceAudio: HTMLAudioElement | null = null
let voiceButton: HTMLButtonElement | null = null

function setPlayIcon(button: HTMLButtonElement, playing: boolean): void {
  button.innerHTML = playing ? PAUSE_ICON : PLAY_ICON
  button.title = playing ? 'Pause' : 'Play'
  button.setAttribute('aria-label', playing ? 'Pause' : 'Play')
}

function videoForButton(button: HTMLButtonElement): HTMLVideoElement | null {
  const found = button.closest('.card')?.querySelector('video.card-video')
  return found instanceof HTMLVideoElement ? found : null
}

function startVoice(button: HTMLButtonElement, src: string): void {
  if (voiceAudio) {
    voiceAudio.pause()
    if (voiceButton && voiceButton !== button) setPlayIcon(voiceButton, false)
  }
  voiceAudio = new Audio(src)
  voiceButton = button
  voiceAudio.onended = () => {
    setPlayIcon(button, false)
    if (voiceButton === button) voiceButton = null
  }
  setPlayIcon(button, true)
  void voiceAudio.play().catch(() => setPlayIcon(button, false))
}

function toggleScenePlay(button: HTMLButtonElement): void {
  const video = videoForButton(button)
  const src = button.dataset.src
  const voicePlaying = voiceButton === button && voiceAudio !== null && !voiceAudio.paused
  if ((video && !video.paused) || voicePlaying) {
    if (video) video.pause()
    if (voiceAudio) voiceAudio.pause()
    setPlayIcon(button, false)
    return
  }
  if (video) {
    video.onended = () => setPlayIcon(button, false)
    video.onpause = () => setPlayIcon(button, false)
    setPlayIcon(button, true)
    void video.play().catch(() => setPlayIcon(button, false))
    return
  }
  if (src) startVoice(button, src)
}

function fullscreenSceneVideo(button: HTMLButtonElement): void {
  const video = videoForButton(button)
  if (!video) return
  if (video.paused) toggleScenePlay(button)
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  else void video.requestFullscreen().catch(() => {})
}

function renderGenerateBtn(storyId: string, asset?: Asset): string {
  if (!canGenerate(asset) || !asset) return ''
  return `<button type="button" class="gen-btn" data-story="${escapeHtml(storyId)}" data-name="${escapeHtml(asset.name)}" data-kind="${escapeHtml(asset.kind)}">Generate</button>`
}

function stripCaptionMarkup(text: string): string {
  return text
    .replace(/\[laughter\]/gi, '')
    .replace(/<(speed|volume|emotion|break|spell)\b[^>]*\/>/gi, ' ')
    .replace(/<\/?(speed|volume|emotion|break|spell)\b[^>]*>/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function getCaptionLines(caption?: string): string[] {
  if (!caption) return []
  return caption
    .split('\n')
    .map(stripCaptionMarkup)
    .filter(Boolean)
}

function getCaptionSizeClass(lines: string[]): string {
  const totalClean = lines.map((l) => l.replace(/\*/g, '').trim())
  const totalLen = totalClean.reduce((sum, l) => sum + l.length, 0)
  const count = lines.length

  if (count > 1) {
    if (totalLen <= 60) return 'caption-md'
    if (totalLen <= 120) return 'caption-sm'
    return 'caption-xs'
  }

  const len = totalClean[0]?.length ?? 0
  if (len <= 25) return 'caption-xl'
  if (len <= 50) return 'caption-lg'
  if (len <= 90) return 'caption-md'
  if (len <= 140) return 'caption-sm'
  return 'caption-xs'
}

function formatCaption(text: string): string {
  const escaped = escapeHtml(text)
  return escaped
    .replace(/\*\*\*([^*]+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
}

function renderCaptions(scene: ImageScene): string {
  const lines = getCaptionLines(scene.caption)
  const hasCaption = lines.length > 0
  const hasSpeaker = Boolean(scene.speaker?.trim())
  if (!hasCaption && !hasSpeaker) return ''

  const isLeft = hasSpeaker || lines.length > 1
  const captionLinesHtml = lines
    .map((l) => `<div class="caption-line">${formatCaption(l)}</div>`)
    .join('')

  const classes = [
    'caption',
    getCaptionSizeClass(lines),
    isLeft ? 'caption-left' : '',
  ].filter(Boolean).join(' ')

  const captionHtml = hasCaption
    ? `<div class="${classes}">${captionLinesHtml}</div>`
    : ''

  const initial = hasSpeaker ? escapeHtml(scene.speaker!.trim()[0]?.toUpperCase() ?? '') : ''
  const speakerHtml = hasSpeaker
    ? `<div class="speaker"><span class="avatar"><span class="avatar-letter">${initial}</span></span><span>${escapeHtml(scene.speaker!)}</span></div>`
    : ''

  return `<div class="card-caption">${captionHtml}${speakerHtml}</div>`
}

function renderImageScene(scene: ImageScene, assets: Story['assets'], storyId: string): string {
  const asset = findAsset(assets, scene.name)
  const captions = renderCaptions(scene)
  const titleHtml = captions ? '' : `<div class="card-title">${escapeHtml(scene.name)}</div>`
  const overlayHtml = scene.speech?.key ? playOverlayTag(speechSrc(storyId, scene.speech.key)) : ''
  return `
    <div class="${cardClass(Boolean(asset?.url))}">
      ${imgTag(asset?.url)}
      ${overlayHtml}
      ${titleHtml}
      ${captions}
      ${captions ? '' : renderGenerateBtn(storyId, asset)}
    </div>
  `
}

function renderVideoScene(scene: VideoScene, assets: Story['assets'], storyId: string): string {
  const asset = findAsset(assets, scene.name)
  const url = asset?.url
  return `
    <div class="${cardClass(Boolean(url))}">
      ${url ? `${sceneVideoTag(url)}${playOverlayTag()}` : ''}
      <div class="card-title">${escapeHtml(scene.name)}</div>
      ${renderGenerateBtn(storyId, asset)}
    </div>
  `
}

function renderScene(scene: Scene, assets: Story['assets'], storyId: string): string {
  switch (scene.type) {
    case 'image':
      return renderImageScene(scene, assets, storyId)
    case 'video':
      return renderVideoScene(scene, assets, storyId)
    default: {
      const _exhaustive: never = scene
      return _exhaustive
    }
  }
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

function renderCard(card: Card, assets: Story['assets'], storyId: string): string {
  const coverAsset = findAsset(assets, card.cover)
  const attrsHtml = renderCardAttrs(card.attributes ?? {})
  const cardClasses = cardClass(Boolean(coverAsset?.url))

  return `
    <div class="${cardClasses}">
      ${imgTag(coverAsset?.url)}
      <div class="card-title">${escapeHtml(card.name)}</div>
      ${attrsHtml}
      ${renderGenerateBtn(storyId, coverAsset)}
    </div>
  `
}

function renderAsset(asset: Asset, storyId: string): string {
  const kind = asset.kind
  const hasVisual = Boolean(asset.url)
  let visualHtml = ''
  switch (kind) {
    case 'video':
      visualHtml = videoTag(asset.url)
      break
    case 'image':
      visualHtml = imgTag(asset.url)
      break
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }

  const canPromptAsset = canPrompt(asset)
  const regenBtnHtml = canPromptAsset && hasVisual
    ? `<button type="button" class="gen-btn regen-btn regen-icon" data-story="${escapeHtml(storyId)}" data-name="${escapeHtml(asset.name)}" data-kind="${escapeHtml(kind)}" aria-label="Regenerate" title="Regenerate">${REFRESH_ICON}</button>`
    : ''
  const actionsHtml = regenBtnHtml
    ? `<div class="asset-actions">${regenBtnHtml}</div>`
    : ''
  const genBtnHtml = canPromptAsset && !asset.url
    ? `<button type="button" class="gen-btn" data-story="${escapeHtml(storyId)}" data-name="${escapeHtml(asset.name)}" data-kind="${escapeHtml(kind)}">Generate</button>`
    : ''

  return `
    <div class="${cardClass(hasVisual, 'card-asset')}">
      ${visualHtml}
      <div class="card-topblur"></div>
      <div class="card-title">${escapeHtml(asset.name)}</div>
      ${actionsHtml}
      ${genBtnHtml}
    </div>
  `
}

function renderIndex(worlds: Array<string | World>): void {
  document.title = 'Studio'
  const header = document.querySelector('header')
  const main = document.querySelector('main')
  if (!header || !main) return

  header.innerHTML = `
    <span class="header-title">worlds</span>
    <span class="tab-count">${worlds.length}</span>
  `

  if (!worlds.length) {
    main.className = 'list'
    main.innerHTML = '<span class="muted">no worlds</span>'
    return
  }

  main.className = 'grid'
  main.innerHTML = worlds
    .map((item) => {
      const id = typeof item === 'string' ? item : item.id
      const title = typeof item === 'string' ? item : item.title || item.id
      const cover = typeof item === 'string' ? undefined : item.cover

      return `
        <a href="/${encodeURIComponent(id)}" class="${cardClass(Boolean(cover))}">
          ${imgTag(cover)}
          <div class="card-title">${escapeHtml(title)}</div>
        </a>
      `
    })
    .join('\n')
}

type StoryTab = 'scenes' | 'cards' | 'assets'

function getStoryTab(): StoryTab {
  const tab = new URLSearchParams(location.search).get('tab')
  if (tab === 'cards' || tab === 'assets') return tab
  return 'scenes'
}

function storyTabHref(storyId: string, tab: StoryTab): string {
  const path = `/${encodeURIComponent(storyId)}`
  if (tab === 'scenes') return path
  return `${path}?tab=${tab}`
}

function tabLabel(tab: StoryTab): string {
  switch (tab) {
    case 'scenes':
      return 'Scenes'
    case 'cards':
      return 'Cards'
    case 'assets':
      return 'Assets'
    default: {
      const _exhaustive: never = tab
      return _exhaustive
    }
  }
}

function renderTabs(story: Story, active: StoryTab): string {
  const tabs: StoryTab[] = ['scenes', 'cards', 'assets']
  return `<nav class="tabs">${tabs
    .map((tab) => {
      const activeClass = tab === active ? ' tab-active' : ''
      return `<a class="tab${activeClass}" href="${storyTabHref(story.id, tab)}"><span class="tab-count">${tabCount(story, tab)}</span>${tabLabel(tab)}</a>`
    })
    .join('')}</nav>`
}

function tabCount(story: Story, tab: StoryTab): number {
  switch (tab) {
    case 'scenes':
      return story.scenes?.length ?? 0
    case 'cards':
      return story.cards?.length ?? 0
    case 'assets':
      return story.assets?.length ?? 0
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
    case 'scenes': {
      if (!story.scenes?.length) {
        main.className = 'list'
        main.innerHTML = '<span class="muted">No scenes</span>'
        break
      }
      main.className = 'grid'
      main.innerHTML = story.scenes
        .map((s) => renderScene(s, story.assets, story.id))
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
      main.innerHTML = story.cards.map((c) => renderCard(c, story.assets, story.id)).join('\n')
      break
    }
    case 'assets': {
      if (!story.assets.length) {
        main.className = 'list'
        main.innerHTML = '<span class="muted">no assets</span>'
        break
      }
      main.className = 'grid'
      main.innerHTML = story.assets.map((m) => renderAsset(m, story.id)).join('\n')
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
function renderOnce(payload: string, render: () => void): void {
  if (payload === lastPayload) return
  lastPayload = payload
  render()
}
async function refresh(): Promise<void> {
  const pathname = currentPathname()
  const route = currentRoute()

  if (!pathname) {
    const worlds = (await fetch('/api/stories', { cache: 'no-store' }).then((res) => res.json())) as Array<
      string | World
    >
    if (currentRoute() !== route) return
    renderOnce(JSON.stringify({ pathname, worlds }), () => renderIndex(worlds))
    return
  }

  const res = await fetch(`/api/stories/${encodeURIComponent(pathname)}`, { cache: 'no-store' })
  if (currentRoute() !== route) return
  if (!res.ok) {
    renderOnce(JSON.stringify({ pathname, missing: true }), () => renderNotFound(pathname))
    return
  }

  const story = (await res.json()) as Story
  if (currentRoute() !== route) return
  renderOnce(JSON.stringify({ pathname, search: location.search, story }), () => renderStory(story))
}

const generating = new Set<string>()

async function generateFromButton(button: HTMLButtonElement): Promise<void> {
  const storyId = button.dataset.story
  const name = button.dataset.name
  if (!storyId || !name) return
  const kind = button.dataset.kind ?? 'image'
  const job = `${storyId}:${name}:${kind}`
  if (generating.has(job)) return
  generating.add(job)
  button.disabled = true
  const isIcon = button.classList.contains('regen-icon')
  if (isIcon) {
    button.classList.add('is-generating')
  } else {
    button.textContent = 'Generating…'
  }
  const started = performance.now()
  const endpoint = kind === 'video' ? 'generate-video' : 'generate-image'
  const payload = kind === 'video' ? { name, duration: 5 } : { name }
  console.error('asset gen start', { storyId, name, kind })
  try {
    const res = await fetch(`/api/stories/${encodeURIComponent(storyId)}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `Generate failed (${res.status})`)
    }
    console.error('asset gen ok', { storyId, name, kind, ms: Math.round(performance.now() - started) })
    cacheBuster = Date.now()
    lastPayload = ''
    await refresh()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('asset gen error', { storyId, name, kind, ms: Math.round(performance.now() - started), error: message })
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
  const overlay = target.closest('button.play-overlay')
  if (overlay instanceof HTMLButtonElement) {
    event.preventDefault()
    toggleScenePlay(overlay)
    return
  }
  const vid = target.closest('video.card-video')
  if (vid instanceof HTMLVideoElement) {
    const cardButton = vid.closest('.card')?.querySelector('button.play-overlay')
    if (cardButton instanceof HTMLButtonElement) {
      event.preventDefault()
      toggleScenePlay(cardButton)
    }
    return
  }
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

document.addEventListener('dblclick', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const scope = target.closest('button.play-overlay, video.card-video')
  if (!scope) return
  const card = scope.closest('.card')
  const button = card?.querySelector('button.play-overlay')
  if (button instanceof HTMLButtonElement) {
    event.preventDefault()
    fullscreenSceneVideo(button)
  }
})

void refresh()
setInterval(() => {
  void refresh()
}, 1000)
