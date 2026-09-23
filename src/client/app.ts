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
import { avatarHtml, portraitIndex, portraitUrl } from './avatar'
import { stripSpeechTags } from './caption'
import { escapeHtml, icon, richText } from './html'
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

const ARROW_ICON = icon('arrow-back-outline')
const X_ICON = icon('close-outline')
const CARDS_ICON = icon('albums-outline')
const POINTER_ICON = icon('hand-left-outline')
const REFRESH_ICON = icon('refresh-outline')
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
  return `<button type="button" class="play-btn play-overlay"${src} aria-label="Play" title="Play">${icon('play')}</button>`
}

let voiceAudio: HTMLAudioElement | null = null
let voiceButton: HTMLButtonElement | null = null

function setPlayIcon(button: HTMLButtonElement, playing: boolean): void {
  button.querySelector('ion-icon')?.setAttribute('name', playing ? 'pause' : 'play')
  const label = playing ? 'Pause' : 'Play'
  button.title = label
  button.setAttribute('aria-label', label)
}

function videoForButton(button: HTMLButtonElement): HTMLVideoElement | null {
  const found = button.parentElement?.querySelector('video.card-video')
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
  return stripSpeechTags(text)
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

  if (lines.length > 1) return totalLen <= 80 ? 'caption-md' : 'caption-sm'

  const len = totalClean[0]?.length ?? 0
  if (len <= 50) return 'caption-lg'
  if (len <= 100) return 'caption-md'
  return 'caption-sm'
}

function renderCaptions(scene: DialogueScene, faces: Map<string, string>): string {
  const lines = getCaptionLines(scene.caption)
  const hasCaption = lines.length > 0
  const hasSpeaker = Boolean(scene.speaker?.trim())
  if (!hasCaption && !hasSpeaker) return ''

  const captionLinesHtml = lines
    .map((l) => `<div class="caption-line">${richText(l)}</div>`)
    .join('')
  const classes = ['caption', getCaptionSizeClass(lines), 'caption-left']
    .filter(Boolean)
    .join(' ')

  const captionHtml = hasCaption
    ? `<div class="${classes}">${captionLinesHtml}</div>`
    : ''

  const speakerName = scene.speaker?.trim() ?? ''
  const face = hasSpeaker
    ? avatarHtml(speakerName, portraitUrl(faces, speakerName), cacheBuster)
    : ''
  const speakerHtml = hasSpeaker
    ? `<div class="speaker">${face}<span>${escapeHtml(speakerName)}</span></div>`
    : ''

  return `<div class="card-caption">${captionHtml}${speakerHtml}</div>`
}

function sceneMarked(index: number): boolean {
  return selected.has(index)
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

function renderDialogueScene(
  scene: DialogueScene,
  story: Story,
  index: number,
  faces: Map<string, string>,
): string {
  const asset = findAsset(story.assets, scene.background)
  const captions = renderCaptions(scene, faces)
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

function renderScene(
  scene: Scene,
  story: Story,
  index: number,
  faces: Map<string, string>,
): string {
  switch (scene.type) {
    case 'image':
      return renderImageScene(scene, story.assets, story.id, index)
    case 'dialogue':
      return renderDialogueScene(scene, story, index, faces)
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
let viewStory: Story | undefined
let openScene: number | undefined

function pathParts(): string[] {
  return location.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part)
      } catch {
        return part
      }
    })
}

function storyRoute(parts = pathParts()): { id: string; cards: boolean } | undefined {
  if (parts.length === 1) return { id: parts[0], cards: false }
  if (parts.length === 2 && parts[1] === 'cards') return { id: parts[0], cards: true }
  return undefined
}

function storyHref(storyId: string, cards = false): string {
  const path = `/${encodeURIComponent(storyId)}`
  return cards ? `${path}/cards` : path
}

function showScene(index: number | undefined): void {
  openScene = index
  if (!viewStory || storyRoute()?.cards) return
  renderDrawer(viewStory, openScene)
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

function renderLog(story: Story, faces: Map<string, string>): void {
  const log = document.querySelector('.log')
  if (!log) return
  log.innerHTML = logHtml(story, cacheBuster, faces)
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
      <button type="button" class="icon-btn drawer-close" aria-label="Close">${X_ICON}</button>
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
    openScene = undefined
  }
  viewStory = story
  if (openScene !== undefined && openScene >= story.scenes.length) openScene = undefined
  document.title = story.title || story.id
  document.body.classList.add('in-story')
  const chat = document.querySelector('.chat')
  if (chat instanceof HTMLElement) chat.hidden = false
  const header = document.querySelector('header')
  const main = document.querySelector('main')
  if (!header || !main) return

  header.hidden = false
  const cards = storyRoute()?.cards === true
  const itemCount = cards ? story.cards.length : story.scenes.length
  header.innerHTML = `
    <a href="/" class="icon-btn story-back" aria-label="Worlds">${ARROW_ICON}</a>
    <span class="story-title">${escapeHtml(story.title || story.id)}</span>
    <span class="tab-count">${itemCount}</span>
    <a class="cards-link${cards ? ' tab-active' : ''}" href="${storyHref(story.id, !cards)}">${CARDS_ICON}<span class="tab-count">${story.cards.length}</span></a>
  `
  const faces = portraitIndex(story)
  renderLog(story, faces)
  main.className = ''

  if (cards) {
    main.innerHTML = story.cards.length
      ? `<div class="grid cards">${story.cards.map((card) => renderCard(card, story.assets, story.id)).join('\n')}</div>`
      : '<div class="list"><span class="muted">no cards</span></div>'
  } else if (!story.scenes?.length) {
    main.innerHTML = '<div class="list"><span class="muted">No scenes</span></div>'
  } else {
    main.innerHTML = `<div class="grid scenes">${story.scenes.map((scene, index) => renderScene(scene, story, index, faces)).join('\n')}</div>`
  }

  renderDrawer(story, cards ? undefined : openScene)
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

function isSpaLink(link: HTMLAnchorElement, event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if (link.target && link.target !== '_self') return false
  if (link.hasAttribute('download')) return false
  if (link.origin !== location.origin) return false
  return true
}

function navigate(url: string): void {
  if (url === location.pathname) return
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
  const route = location.pathname
  const parts = pathParts()
  const view = storyRoute(parts)

  if (parts.length === 0) {
    const worlds = (await fetch('/api/stories', { cache: 'no-store' }).then((res) =>
      res.json(),
    )) as Array<string | World>
    if (location.pathname !== route) return
    renderOnce(JSON.stringify({ pathname: route, worlds }), () => renderIndex(worlds))
    return
  }

  const storyId = view?.id
  if (!storyId) {
    if (location.pathname !== route) return
    renderOnce(JSON.stringify({ pathname: route, missing: true }), () =>
      renderNotFound(parts.join('/')),
    )
    return
  }

  const res = await fetch(`/api/stories/${encodeURIComponent(storyId)}`, {
    cache: 'no-store',
  })
  if (location.pathname !== route) return
  if (!res.ok) {
    renderOnce(JSON.stringify({ pathname: route, missing: true }), () =>
      renderNotFound(storyId),
    )
    return
  }

  const story = (await res.json()) as Story
  if (location.pathname !== route) return
  renderOnce(JSON.stringify({ pathname: route, story }), () => renderStory(story))
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
    const storyId = storyRoute()?.id
    if (!next || !storyId || !Number.isInteger(at)) return
    bubble.textContent = next
    void postTurn(storyId, next, at).catch((error: unknown) => {
      bubble.textContent = ''
      bubble.append(area)
      area.value = next
      area.placeholder = error instanceof Error ? error.message : String(error)
      area.focus()
    })
  })
}

const composerInput = document.querySelector('.composer textarea')
if (composerInput instanceof HTMLTextAreaElement) {
  composerInput.addEventListener('keydown', (event) => {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return
    event.preventDefault()
    composerInput.form?.requestSubmit()
  })
}

document.querySelector('.composer')?.addEventListener('submit', (event) => {
  event.preventDefault()
  const form = event.currentTarget
  if (!(form instanceof HTMLFormElement)) return
  const input = form.querySelector('textarea')
  if (!(input instanceof HTMLTextAreaElement)) return
  const text = messageText(input.value)
  const storyId = storyRoute()?.id
  if (!text || !storyId) return
  const draft = input.value
  input.value = ''
  input.placeholder = 'Message...'
  void postTurn(storyId, text)
    .catch((error: unknown) => {
      input.value = draft
      input.placeholder = error instanceof Error ? error.message : String(error)
    })
    .finally(() => {
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
  const close = target.closest('button.drawer-close')
  if (close) {
    event.preventDefault()
    showScene(undefined)
    return
  }
  const overlay = target.closest('button.play-overlay')
  if (overlay instanceof HTMLButtonElement) {
    event.preventDefault()
    toggleScenePlay(overlay)
    return
  }
  if (target.closest('video.card-video')) event.preventDefault()
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
      document
        .querySelector(`.scene-card[data-scene="${index}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    }
  }
  const scene = target.closest('.scene-card')
  if (scene instanceof HTMLElement && !target.closest('button')) {
    const index = Number(scene.dataset.scene)
    if (Number.isInteger(index) && storyRoute()) {
      event.preventDefault()
      chooseScene(index, event.shiftKey)
      showScene(index)
      return
    }
  }
  const link = target.closest('a')
  if (!link || !isSpaLink(link, event)) return
  event.preventDefault()
  navigate(link.pathname)
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
  const scope = target.closest('button.play-overlay')
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
