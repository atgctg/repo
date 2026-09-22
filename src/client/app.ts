import { ArrowLeft, MousePointerClick, Pause, Play, PlayingCardsFan, X, createElement, type IconNode } from 'lucide'
import { formatRanges } from '../project'
import { isPlainObject } from '../records'
import { logHtml } from './log'
import type { Asset, Card, DialogueScene, ImageScene, Scene, Story, VideoScene, World } from '../types'

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
  return createElement(node, { width: '18', height: '18', 'aria-hidden': 'true' }).outerHTML
}

const ARROW_ICON = icon(ArrowLeft)
const X_ICON = icon(X)
const CARDS_ICON = icon(PlayingCardsFan)
const POINTER_ICON = icon(MousePointerClick)
const PLAY_ICON = icon(Play)
const PAUSE_ICON = icon(Pause)
function cardClass(hasImage: boolean, extra = ''): string {
  return ['card', extra, hasImage ? 'has-image' : ''].filter(Boolean).join(' ')
}

function imgTag(url?: string): string {
  return url ? `<img class="card-img" src="${escapeHtml(url)}?v=${cacheBuster}" alt="" />` : ''
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

function renderCaptions(scene: DialogueScene): string {
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

function sceneCard(index: number, hasImage: boolean, body: string): string {
  const on = selected.has(index) ? ' is-selected' : ''
  return `<div class="${cardClass(hasImage)} scene-card${on}" data-scene="${index}" style="--i:${index}">${body}</div>`
}

function renderImageScene(scene: ImageScene, assets: Story['assets'], storyId: string, index: number): string {
  const asset = findAsset(assets, scene.name)
  return sceneCard(
    index,
    Boolean(asset?.url),
    `${imgTag(asset?.url)}<div class="card-title">${escapeHtml(scene.name)}</div>${renderGenerateBtn(storyId, asset)}`,
  )
}

function renderDialogueScene(scene: DialogueScene, assets: Story['assets'], storyId: string, index: number): string {
  const asset = findAsset(assets, scene.background)
  const captions = renderCaptions(scene)
  const overlayHtml = scene.speech?.key ? playOverlayTag(speechSrc(storyId, scene.speech.key)) : ''
  return sceneCard(index, Boolean(asset?.url), `${imgTag(asset?.url)}${overlayHtml}${captions}`)
}

function renderVideoScene(scene: VideoScene, assets: Story['assets'], storyId: string, index: number): string {
  const asset = findAsset(assets, scene.name)
  const url = asset?.url
  return sceneCard(
    index,
    Boolean(url),
    `${url ? `${sceneVideoTag(url)}${playOverlayTag()}` : ''}<div class="card-title">${escapeHtml(scene.name)}</div>${renderGenerateBtn(storyId, asset)}`,
  )
}

function renderScene(scene: Scene, assets: Story['assets'], storyId: string, index: number): string {
  switch (scene.type) {
    case 'image':
      return renderImageScene(scene, assets, storyId, index)
    case 'dialogue':
      return renderDialogueScene(scene, assets, storyId, index)
    case 'video':
      return renderVideoScene(scene, assets, storyId, index)
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
  const attrsHtml = renderCardAttrs({
    ...(card.voice ? { Voice: card.voice } : {}),
    ...card.attributes,
  })
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

  header.innerHTML = `
    <span class="header-title">worlds</span>
    <span class="tab-count">${worlds.length}</span>
  `

  if (!worlds.length) {
    main.className = ''
    main.innerHTML = '<div class="list"><span class="muted">no worlds</span></div>'
    return
  }

  main.className = ''
  main.innerHTML = `<div class="grid">${worlds
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
    .join('\n')}</div>`
}

const selected = new Set<number>()

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

function renderLog(story: Story): void {
  const log = document.querySelector('.log')
  if (!log) return
  log.innerHTML = logHtml(story, selected, cacheBuster)
}

function paintSelection(): void {
  document.querySelectorAll('.scene-card').forEach((el) => {
    if (!(el instanceof HTMLElement)) return
    el.classList.toggle('is-selected', selected.has(Number(el.dataset.scene)))
  })
  document.querySelectorAll('.event[data-scene]').forEach((el) => {
    if (!(el instanceof HTMLElement)) return
    el.classList.toggle('is-selected', selected.has(Number(el.dataset.scene)))
  })
  const indicator = document.querySelector('.selection-indicator')
  if (indicator instanceof HTMLElement) {
    indicator.hidden = selected.size === 0
    indicator.innerHTML = `${POINTER_ICON}<span>${selected.size}</span>`
  }
}

function chooseScene(index: number, toggle: boolean): void {
  if (toggle) {
    if (selected.has(index)) selected.delete(index)
    else selected.add(index)
  } else {
    selected.clear()
    selected.add(index)
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

function relatedCard(story: Story, scene: Scene): Card | undefined {
  if (scene.type === 'dialogue' && scene.speaker) {
    const speaker = story.cards.find((card) => card.name.toLowerCase() === scene.speaker?.toLowerCase())
    if (speaker) return speaker
  }
  const name = scene.type === 'dialogue' ? scene.background : scene.name
  return story.cards.find(
    (card) => card.cover?.toLowerCase() === name.toLowerCase() || card.name.toLowerCase() === name.toLowerCase(),
  )
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
  const card = relatedCard(story, scene)
  const prompt = asset?.prompt ? JSON.stringify(asset.prompt, null, 2) : ''
  drawer.innerHTML = `
    <div class="drawer-head">
      <div class="drawer-title">${escapeHtml(scene.type === 'dialogue' ? scene.background : scene.name)}</div>
      <a class="icon-btn drawer-close" href="${storyHref(story.id, showCards() ? { cards: true } : undefined)}" aria-label="Close">${X_ICON}</a>
    </div>
    ${prompt ? `<pre class="drawer-prompt">${escapeHtml(prompt)}</pre>` : '<span class="muted">no prompt</span>'}
    ${card ? `<div class="drawer-card">${renderCard(card, story.assets, story.id)}</div>` : ''}
    ${renderDrawerGen(story.id, asset)}
  `
}

function renderDrawerGen(storyId: string, asset?: Asset): string {
  if (!canPrompt(asset) || !asset) return ''
  const label = asset.url ? 'Regenerate' : 'Generate'
  return `<button type="button" class="gen-btn drawer-gen" data-story="${escapeHtml(storyId)}" data-name="${escapeHtml(asset.name)}" data-type="${asset.type}">${label}</button>`
}

function renderStory(story: Story): void {
  document.title = story.title || story.id
  document.body.classList.add('in-story')
  const chat = document.querySelector('.chat')
  if (chat instanceof HTMLElement) chat.hidden = false
  const header = document.querySelector('header')
  const main = document.querySelector('main')
  if (!header || !main) return

  const cards = showCards()
  header.innerHTML = `
    <a href="/" class="icon-btn story-back" aria-label="Worlds">${ARROW_ICON}</a>
    <span class="story-title">${escapeHtml(story.title || story.id)}</span>
    <a class="cards-link${cards ? ' tab-active' : ''}" href="${storyHref(story.id, { cards: true })}">${CARDS_ICON}<span class="tab-count">${story.cards.length}</span></a>
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
    main.innerHTML = `<div class="grid scenes">${story.scenes.map((scene, index) => renderScene(scene, story.assets, story.id, index)).join('\n')}</div>`
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
  const type = button.dataset.type === 'video' ? 'video' : 'image'
  const job = `${storyId}:${name}:${type}`
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
    console.error('asset gen ok', { storyId, name, type, ms: Math.round(performance.now() - started) })
    cacheBuster = Date.now()
    lastPayload = ''
    await refresh()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('asset gen error', { storyId, name, type, ms: Math.round(performance.now() - started), error: message })
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

let draftAt: number | undefined

document.querySelector('.composer')?.addEventListener('submit', (event) => {
  event.preventDefault()
  const form = event.currentTarget
  if (!(form instanceof HTMLFormElement)) return
  const input = form.querySelector('input')
  if (!(input instanceof HTMLInputElement)) return
  const text = messageText(input.value)
  const storyId = currentPathname()
  if (!text || !storyId) return
  const at = draftAt
  input.disabled = true
  void fetch(`/api/stories/${encodeURIComponent(storyId)}/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(at === undefined ? { text } : { text, at }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Turn failed (${res.status})`)
      }
      input.value = ''
      draftAt = undefined
      input.placeholder = 'Message'
      cacheBuster = Date.now()
      lastPayload = ''
      await refresh()
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
  const rewind = target.closest('button.rewind')
  if (rewind instanceof HTMLButtonElement) {
    event.preventDefault()
    const at = Number(rewind.dataset.at)
    const storyId = currentPathname()
    const input = document.querySelector('.composer input')
    if (!Number.isInteger(at) || !(input instanceof HTMLInputElement)) return
    const pre = rewind.parentElement?.querySelector('pre')
    const parsed = pre ? (JSON.parse(pre.textContent ?? '{}') as { text?: string }) : {}
    draftAt = at
    input.value = rewind.textContent ?? parsed.text ?? ''
    input.placeholder = 'Rewind'
    input.focus()
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
  const gen = target.closest('button.gen-btn')
  if (gen instanceof HTMLButtonElement) {
    event.preventDefault()
    void generateFromButton(gen)
    return
  }
  const row = target.closest('.event')
  if (row instanceof HTMLElement && row.dataset.scene !== undefined && !target.closest('button, a')) {
    const index = Number(row.dataset.scene)
    if (Number.isInteger(index)) {
      chooseScene(index, event.shiftKey)
      document.querySelector(`.scene-card[data-scene="${index}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }
  const scene = target.closest('.scene-card')
  if (scene instanceof HTMLElement && !target.closest('button, video')) {
    const index = Number(scene.dataset.scene)
    const storyId = currentPathname()
    if (Number.isInteger(index) && storyId) {
      event.preventDefault()
      if (event.shiftKey) {
        chooseScene(index, true)
        return
      }
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
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
  const target = event.target
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
  if (target instanceof HTMLElement && target.isContentEditable) return
  const input = document.querySelector('.composer input')
  const chat = input?.closest('.chat')
  if (!(input instanceof HTMLInputElement) || input.disabled) return
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

void refresh()
setInterval(() => {
  void refresh()
}, 1000)
