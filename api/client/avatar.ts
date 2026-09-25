import type { Story } from 'shared'
import { escapeHtml } from './html'

export function portraitIndex(story: Story): Map<string, string> {
  const assets = new Map<string, string>()
  for (const asset of story.assets) {
    if (!asset.url) continue
    const key = asset.name.toLowerCase()
    if (!assets.has(key)) assets.set(key, asset.url)
  }
  const faces = new Map<string, string>()
  for (const card of story.cards) {
    const key = card.name.toLowerCase()
    if (faces.has(key)) continue
    const cover = card.cover?.toLowerCase()
    const url = (cover ? assets.get(cover) : undefined) ?? assets.get(key)
    if (url) faces.set(key, url)
  }
  for (const [key, url] of assets) {
    if (!faces.has(key)) faces.set(key, url)
  }
  return faces
}

export function portraitUrl(
  faces: Map<string, string>,
  name: string,
): string | undefined {
  return faces.get(name.trim().toLowerCase())
}

export function avatarHtml(
  name: string,
  url: string | undefined,
  cacheBuster: number,
): string {
  if (url)
    return `<span class="avatar"><img src="${escapeHtml(url)}?v=${cacheBuster}" alt="" /></span>`
  const letter = [...name.trim()][0]?.toLocaleUpperCase() ?? ''
  return `<span class="avatar" aria-hidden="true">${escapeHtml(letter)}</span>`
}
