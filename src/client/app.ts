import {
  ArrowLeft,
  MousePointerClick,
  Pause,
  Play,
  PlayingCardsFan,
  RefreshCw,
  X,
  createElement,
  type IconNode,
} from 'lucide'
import { formatRanges } from '@/project'
import type {
  Asset,
  Card,
  DialogueScene,
  ImageScene,
  Scene,
  Story,
  VideoScene,
  World,
} from '@/types'
import { renderAttrs } from './attrs'
import { escapeHtml } from './html'
import { logHtml, sceneDetailHtml } from './log'

{
  const icon = document.createElement('link')
  icon.rel = 'icon'
  icon.type = 'image/x-icon'
  icon.href = '/favicon.ico'
  document.head.appendChild(icon)
}

let cacheBuster = Date.now()

function findAsset(assets: Story['assets'], name?: string): Asset | undefined {
  if (!name) return undefined
  return assets.find((item) => item.name.toLowerCase() === name.toLowerCase())
}

function canGenerate(asset: Asset | undefined): boolean {
  if (!asset || asset.url) return false
  return canPrompt(asset)
}

function canPrompt(asset: Asset | undefined): boolean {
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

function speechSrc(storyId: string, file?: string): string | undefined {
  if (!file) return undefined
  return `/assets/${encodeURIComponent(storyId)}/${encodeURIComponent(file)}`
}

function icon(node: IconNode): string {
  return createElement(node, { width: '18', height: '18', 'aria-hidden': 'true' })
    .outerHTML
}

const ARROW_ICON = icon(ArrowLeft)
const X_ICON = icon(X)
const CARDS_ICON = icon(PlayingCardsFan)
const POINTER_ICON = icon(MousePointerClick)
const PLAY_ICON = icon(Play)
const PAUSE_ICON = icon(Pause)
const REFRESH_ICON = icon(RefreshCw)
function cardClass(hasImage: boolean): string {
  return hasImage ? 'card has-image' : 'card'
}

function imgTag(url?: string): string {
  return url
    ? `<img class="card-img" src="${escapeHtml(url)}?v=${cacheBuster}" alt="" />`
    : ''
}

function sceneVideoTag(url?: string): string {
  return url
    ? `<video class="card-video" src="${escapeHtml(url)}?v=${cacheBuster}" preload="metadata" playsinline></video>`
    : ''
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

function renderGenerateBtn(storyId: string, asset: Asset | undefined): string {
  if (!canGenerate(asset) || !asset) return ''
  return `<button type="button" class="gen-btn" data-story="${escapeHtml(storyId)}" data-name="${escapeHtml(asset.name)}" data-type="${asset.type}">Generate</button>`
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
  return caption.split('\n').map(stripCaptionMarkup).filter(Boolean)
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

function speakerPortrait(
  assets: Story['assets'],
  cards: Card[],
  speaker: string,
): string | undefined {
  const card = cards.find((item) => item.name.toLowerCase() === speaker.toLowerCase())
  return findAsset(assets, card?.cover)?.url ?? findAsset(assets, speaker)?.url
}

function renderCaptions(scene: DialogueScene, story: Story): string {
  const lines = getCaptionLines(scene.caption)
  const hasCaption = lines.length > 0
  const hasSpeaker = Boolean(scene.speaker?.trim())
  if (!hasCaption && !hasSpeaker) return ''

  const captionLinesHtml = lines
    .map((l) => `<div class="caption-line">${formatCaption(l)}</div>`)
    .join('')
  const classes = ['caption', getCaptionSizeClass(lines), 'caption-left']
    .filter(Boolean)
    .join(' ')

  const captionHtml = hasCaption
    ? `<div class="${classes}">${captionLinesHtml}</div>`
    : ''

  const speakerName = scene.speaker?.trim() ?? ''
  const portrait = hasSpeaker
    ? speakerPortrait(story.assets, story.cards, speakerName)
    : undefined
  const face = portrait
    ? `<img class="avatar" src="${escapeHtml(portrait)}?v=${cacheBuster}" alt="" />`
    : `<span class="avatar"><span class="avatar-letter">${escapeHtml(speakerName[0]?.toUpperCase() ?? '')}</span></span>`
  const speakerHtml = hasSpeaker
    ? `<div class="speaker">${face}<span>${escapeHtml(speakerName)}</span></div>`
    : ''

  return `<div class="card-caption">${captionHtml}${speakerHtml}</div>`
}

function sceneMarked(index: number): boolean {
  return selected.has(index) || index === sceneIndex()
}

function sceneCard(index: number, hasImage: boolean, body: string): string {
  const on = sceneMarked(index) ? ' is-selected' : ''
  return `<div class="${cardClass(hasImage)} scene-card${on}" data-scene="${index}" style="--i:${index}">${body}<span class="scene-ring"></span></div>`
}

function renderImageScene(
  scene: ImageScene,
  assets: Story['assets'],
  storyId: string,
  index: number,
): string {
  const asset = findAsset(assets, scene.name)
  return sceneCard(
    index,
    Boolean(asset?.url),
    `${imgTag(asset?.url)}<div class="card-title">${escapeHtml(scene.name)}</div>${renderGenerateBtn(storyId, asset)}`,
  )
}

function renderDialogueScene(scene: DialogueScene, story: Story, index: number): string {
  const asset = findAsset(story.assets, scene.background)
  const captions = renderCaptions(scene, story)
  const overlayHtml = scene.speech?.key
    ? playOverlayTag(speechSrc(story.id, scene.speech.key))
    : ''
  return sceneCard(
    index,
    Boolean(asset?.url),
    `${imgTag(asset?.url)}${overlayHtml}${captions}`,
  )
}

function renderVideoScene(
  scene: VideoScene,
  assets: Story['assets'],
  storyId: string,
  index: number,
): string {
  const asset = findAsset(assets, scene.name)
  const url = asset?.url
  return sceneCard(
    index,
    Boolean(url),
    `${url ? `${sceneVideoTag(url)}${playOverlayTag()}` : ''}<div class="card-title">${escapeHtml(scene.name)}</div>${renderGenerateBtn(storyId, asset)}`,
  )
}

function renderScene(scene: Scene, story: Story, index: number): string {
  switch (scene.type) {
    case 'image':
      return renderImageScene(scene, story.assets, story.id, index)
    case 'dialogue':
      return renderDialogueScene(scene, story, index)
    case 'video':
      return renderVideoScene(scene, story.assets, story.id, index)
    default: {
      const _exhaustive: never = scene
      return _exhaustive
    }
  }
}

function renderCard(card: Card, assets: Story['assets'], storyId: string): string {
  const coverAsset = findAsset(assets, card.cover)
  const attrsHtml = renderAttrs({
    ...(card.voice ? { Voice: card.voice } : {}),
    ...card.attributes,
  })

  return `
    <div class="${cardClass(false)}">
      <div class="card-title">${escapeHtml(card.name)}</div>
      ${attrsHtml}
      ${renderGenerateBtn(storyId, coverAsset)}
    </div>
  `
}

function renderIndex(worlds: Array<string | World>): void {
  document.title = 'Studio'
  document.body.classList.remove('in-story', 'show-drawer')
  const chat = document.querySelector('.chat')
  const drawer = document.querySelector('.drawer')
  if (chat instanceof HTMLElement) chat.hidden = true
  if (drawer instanceof HTMLElement) drawer.hidden = true
  const header = document.querySelector('header')
  const main = document.querySelector('main')
  if (!header || !main) return

  header.hidden = true
  header.innerHTML = ''

  if (!worlds.length) {
    main.className = ''
    main.innerHTML = '<div class="list"><span class="muted">no worlds</span></div>'
    return
  }

  main.className = ''
  main.innerHTML = `<div class="grid scenes">${worlds
    .map((item) => {
      const id = typeof item === 'string' ? item : item.id
      const title = typeof item === 'string' ? item : item.title || item.id
      const cover = typeof item === 'string' ? undefined : item.cover

      return `
        <a href="/${encodeURIComponent(id)}" class="${cardClass(Boolean(cover))} scene-card">
          ${imgTag(cover)}
          <div class="card-title">${escapeHtml(title)}</div>
        </a>
      `
    })
    .join('\n')}</div>`
}

const selected = new Set<number>()
let anchor: number | undefined
let selectedStory = ''

function showCards(): boolean {
  return new URLSearchParams(location.search).get('cards') === '1'
}

function sceneIndex(): number | undefined {
  const raw = new URLSearchParams(location.search).get('scene')
  if (raw === null || !/^\d+$/.test(raw)) return undefined
  return Number(raw)
}

function storyHref(storyId: string, query?: { cards?: boolean; scene?: number }): string {
  const path = `/${encodeURIComponent(storyId)}`
  const params = new URLSearchParams()
  if (query?.cards) params.set('cards', '1')
  if (query?.scene !== undefined) params.set('scene', String(query.scene))
  const search = params.toString()
  return search ? `${path}?${search}` : path
}

function updateLogFades(): void {
  const log = document.querySelector('.log')
  const frame = log?.parentElement
  if (!(log instanceof HTMLElement) || !(frame instanceof HTMLElement)) return
  const atTop = log.scrollTop <= 1
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 1
  frame.classList.toggle('at-top', atTop)
  frame.classList.toggle('at-bottom', atBottom)
}

function renderLog(story: Story): void {
  const log = document.querySelector('.log')
  if (!log) return
  log.innerHTML = logHtml(story, cacheBuster)
  updateLogFades()
}

function paintSelection(): void {
  document.querySelectorAll('.scene-card').forEach((el) => {
    if (!(el instanceof HTMLElement)) return
    el.classList.toggle('is-selected', sceneMarked(Number(el.dataset.scene)))
  })
  const indicator = document.querySelector('.selection-indicator')
  if (indicator instanceof HTMLElement) {
    indicator.hidden = selected.size === 0
    indicator.innerHTML = `${POINTER_ICON}<span>${selected.size}</span>`
  }
}

function chooseScene(index: number, range: boolean): void {
  if (range && anchor !== undefined) {
    const start = Math.min(anchor, index)
    const end = Math.max(anchor, index)
    selected.clear()
    for (let i = start; i <= end; i++) selected.add(i)
  } else {
    selected.clear()
    selected.add(index)
    anchor = index
  }
  paintSelection()
}

function messageText(input: string): string {
  const body = input.replace(/^<selected>\n[\s\S]*?\n<\/selected>\n?/, '').trim()
  if (!body) return ''
  if (selected.size === 0) return body
  return `<selected>\n${formatRanges([...selected])}\n</selected>\n${body}`
}

function sceneAsset(story: Story, scene: Scene): Asset | undefined {
  switch (scene.type) {
    case 'image':
    case 'video':
      return findAsset(story.assets, scene.name)
    case 'dialogue':
      return findAsset(story.assets, scene.background)
    default: {
      const _exhaustive: never = scene
      return _exhaustive
    }
  }
}

function drawerPreview(story: Story, scene: Scene, asset: Asset | undefined): string {
  const url = asset?.url
  if (!url) return ''
  if (scene.type === 'video') {
    return `<div class="drawer-preview">${sceneVideoTag(url)}${playOverlayTag()}</div>`
  }
  const audio =
    scene.type === 'dialogue' ? speechSrc(story.id, scene.speech?.key) : undefined
  const overlay = audio ? playOverlayTag(audio) : ''
  return `<div class="drawer-preview">${imgTag(url)}${overlay}</div>`
}

function renderDrawer(story: Story, index: number | undefined): void {
  const drawer = document.querySelector('.drawer')
  if (!(drawer instanceof HTMLElement)) return
  const scene = index === undefined ? undefined : story.scenes[index]
  const open = Boolean(scene)
  drawer.hidden = !open
  document.body.classList.toggle('show-drawer', open)
  if (!scene || index === undefined) {
    drawer.innerHTML = ''
    return
  }
  const asset = sceneAsset(story, scene)
  drawer.innerHTML = `
    <div class="drawer-bar">
      ${renderDrawerGen(story.id, asset)}
      <a class="icon-btn drawer-close" href="${storyHref(story.id, showCards() ? { cards: true } : undefined)}" aria-label="Close">${X_ICON}</a>
    </div>
    ${drawerPreview(story, scene, asset)}
    ${sceneDetailHtml(story, scene, cacheBuster)}
  `
}

function renderDrawerGen(storyId: string, asset?: Asset): string {
  if (!canPrompt(asset) || !asset) return ''
  const label = asset.url ? 'Regenerate' : 'Generate'
  return `<button type="button" class="drawer-btn" data-story="${escapeHtml(storyId)}" data-name="${escapeHtml(asset.name)}" data-type="${asset.type}">${REFRESH_ICON}<span>${label}</span></button>`
}

function renderStory(story: Story): void {
  if (selectedStory !== story.id) {
    selectedStory = story.id
    selected.clear()
    anchor = undefined
  }
  document.title = story.title || story.id
  document.body.classList.add('in-story')
  const chat = document.querySelector('.chat')
  if (chat instanceof HTMLElement) chat.hidden = false
  const header = document.querySelector('header')
  const main = document.querySelector('main')
  if (!header || !main) return

  header.hidden = false
  const cards = showCards()
  const itemCount = cards ? story.cards.length : story.scenes.length
  header.innerHTML = `
    <a href="/" class="icon-btn story-back" aria-label="Worlds">${ARROW_ICON}</a>
    <span class="story-title">${escapeHtml(story.title || story.id)}</span>
    <span class="tab-count">${itemCount}</span>
    <a class="cards-link${cards ? ' tab-active' : ''}" href="${storyHref(story.id, cards ? undefined : { cards: true })}">${CARDS_ICON}<span class="tab-count">${story.cards.length}</span></a>
  `
  renderLog(story)
  main.className = ''

  if (cards) {
    main.innerHTML = story.cards.length
      ? `<div class="grid cards">${story.cards.map((card) => renderCard(card, story.assets, story.id)).join('\n')}</div>`
      : '<div class="list"><span class="muted">no cards</span></div>'
  } else if (!story.scenes?.length) {
    main.innerHTML = '<div class="list"><span class="muted">No scenes</span></div>'
  } else {
    main.innerHTML = `<div class="grid scenes">${story.scenes.map((scene, index) => renderScene(scene, story, index)).join('\n')}</div>`
  }

  renderDrawer(story, cards ? undefined : sceneIndex())
  paintSelection()
}

function renderNotFound(id: string): void {
  document.title = id
  document.body.classList.remove('in-story', 'show-drawer')
  const chat = document.querySelector('.chat')
  const drawer = document.querySelector('.drawer')
  if (chat instanceof HTMLElement) chat.hidden = true
  if (drawer instanceof HTMLElement) drawer.hidden = true
  const header = document.querySelector('header')
  const main = document.querySelector('main')
  if (!header || !main) return

  header.hidden = false
  header.innerHTML = `
    <a href="/" class="tab story-back"><span>←</span>${escapeHtml(id)}</a>
  `
  main.className = ''
  main.innerHTML = '<div class="list"><span class="muted">not found</span></div>'
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
    const worlds = (await fetch('/api/stories', { cache: 'no-store' }).then((res) =>
      res.json(),
    )) as Array<string | World>
    if (currentRoute() !== route) return
    renderOnce(JSON.stringify({ pathname, worlds }), () => renderIndex(worlds))
    return
  }

  const res = await fetch(`/api/stories/${encodeURIComponent(pathname)}`, {
    cache: 'no-store',
  })
  if (currentRoute() !== route) return
  if (!res.ok) {
    renderOnce(JSON.stringify({ pathname, missing: true }), () =>
      renderNotFound(pathname),
    )
    return
  }

  const story = (await res.json()) as Story
  if (currentRoute() !== route) return
  renderOnce(JSON.stringify({ pathname, search: location.search, story }), () =>
    renderStory(story),
  )
}

const generating = new Set<string>()

async function generateFromButton(button: HTMLButtonElement): Promise<void> {
  const storyId = button.dataset.story
  const name = button.dataset.name
  if (!storyId || !name) return
  const type = button.dataset.type === 'video' ? 'video' : 'image'
  const job = `${storyId}:${name}:${type}`
  if (generating.has(job)) return
  generating.add(job)
  button.disabled = true
  const spins = button.classList.contains('drawer-btn')
  if (spins) button.classList.add('is-generating')
  else button.textContent = 'Generating…'
  const started = performance.now()
  const endpoint = type === 'video' ? 'generate-video' : 'generate-image'
  const payload = type === 'video' ? { name, duration: 5 } : { name }
  console.error('asset gen start', { storyId, name, type })
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
    console.error('asset gen ok', {
      storyId,
      name,
      type,
      ms: Math.round(performance.now() - started),
    })
    cacheBuster = Date.now()
    lastPayload = ''
    await refresh()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('asset gen error', {
      storyId,
      name,
      type,
      ms: Math.round(performance.now() - started),
      error: message,
    })
    button.disabled = false
    if (spins) {
      button.classList.remove('is-generating')
      button.title = message
    } else {
      button.textContent = message
    }
  } finally {
    generating.delete(job)
  }
}

function postTurn(storyId: string, text: string, at?: number): Promise<void> {
  return fetch(`/api/stories/${encodeURIComponent(storyId)}/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(at === undefined ? { text } : { text, at }),
  }).then(async (res) => {
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `Turn failed (${res.status})`)
    }
    cacheBuster = Date.now()
    lastPayload = ''
    await refresh()
  })
}

function editUserMessage(bubble: HTMLElement): void {
  if (bubble.querySelector('textarea')) return
  const text = bubble.textContent ?? ''
  const area = document.createElement('textarea')
  area.rows = 1
  area.value = text
  bubble.textContent = ''
  bubble.append(area)
  area.focus()
  area.setSelectionRange(area.value.length, area.value.length)
  area.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      bubble.textContent = text
      return
    }
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return
    event.preventDefault()
    const next = area.value.trim()
    const at = Number(bubble.dataset.at)
    const storyId = currentPathname()
    if (!next || !storyId || !Number.isInteger(at)) return
    area.disabled = true
    void postTurn(storyId, next, at).catch((error: unknown) => {
      area.disabled = false
      area.placeholder = error instanceof Error ? error.message : String(error)
      area.focus()
    })
  })
}

document.querySelector('.composer textarea')?.addEventListener('keydown', (event) => {
  if (
    event.key !== 'Enter' ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  )
    return
  if (!(event.currentTarget instanceof HTMLTextAreaElement)) return
  event.preventDefault()
  event.currentTarget.form?.requestSubmit()
})

document.querySelector('.composer')?.addEventListener('submit', (event) => {
  event.preventDefault()
  const form = event.currentTarget
  if (!(form instanceof HTMLFormElement)) return
  const input = form.querySelector('textarea')
  if (!(input instanceof HTMLTextAreaElement)) return
  const text = messageText(input.value)
  const storyId = currentPathname()
  if (!text || !storyId) return
  input.disabled = true
  void postTurn(storyId, text)
    .then(() => {
      input.value = ''
      input.placeholder = 'Message'
    })
    .catch((error: unknown) => {
      input.placeholder = error instanceof Error ? error.message : String(error)
    })
    .finally(() => {
      input.disabled = false
      input.focus()
    })
})

document.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const userMsg = target.closest('.user-msg')
  if (userMsg instanceof HTMLElement && !userMsg.querySelector('textarea')) {
    editUserMessage(userMsg)
    return
  }
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
  const gen = target.closest('button.gen-btn, button.drawer-btn')
  if (gen instanceof HTMLButtonElement) {
    event.preventDefault()
    void generateFromButton(gen)
    return
  }
  const row = target.closest('.event')
  if (
    row instanceof HTMLElement &&
    row.dataset.scene !== undefined &&
    !target.closest('button, a, video, textarea')
  ) {
    const index = Number(row.dataset.scene)
    if (Number.isInteger(index)) {
      if (event.shiftKey) event.preventDefault()
      chooseScene(index, event.shiftKey)
      if (
        row instanceof HTMLDetailsElement &&
        !event.shiftKey &&
        !target.closest('summary, .detail')
      )
        row.open = !row.open
      document
        .querySelector(`.scene-card[data-scene="${index}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    }
  }
  const scene = target.closest('.scene-card')
  if (scene instanceof HTMLElement && !target.closest('button, video')) {
    const index = Number(scene.dataset.scene)
    const storyId = currentPathname()
    if (Number.isInteger(index) && storyId) {
      event.preventDefault()
      chooseScene(index, event.shiftKey)
      navigate(storyHref(storyId, { scene: index }))
      return
    }
  }
  const link = target.closest('a')
  if (!link || !isSpaLink(link, event)) return
  event.preventDefault()
  navigate(`${link.pathname}${link.search}`)
})

document.addEventListener('keydown', (event) => {
  if (
    event.key !== '/' ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey
  )
    return
  const target = event.target
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
  if (target instanceof HTMLElement && target.isContentEditable) return
  const input = document.querySelector('.composer textarea')
  const chat = input?.closest('.chat')
  if (!(input instanceof HTMLTextAreaElement) || input.disabled) return
  if (chat instanceof HTMLElement && chat.hidden) return
  event.preventDefault()
  input.focus()
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

document
  .querySelector('.log')
  ?.addEventListener('scroll', updateLogFades, { passive: true })
window.addEventListener('resize', updateLogFades)

void refresh()
setInterval(() => {
  void refresh()
}, 1000)
