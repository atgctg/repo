export function safeStoryId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'asset'
}

const ASSET_EXT = { image: 'jpg', video: 'mp4' } as const

export function assetFileName(name: string, type: keyof typeof ASSET_EXT): string {
  return `${slugify(name)}.${ASSET_EXT[type]}`
}

export function storyAssetUrl(storyId: string, file: string): string {
  return `/assets/${encodeURIComponent(safeStoryId(storyId))}/${encodeURIComponent(file)}`
}

export function worldAssetUrl(worldId: string, file: string): string {
  return `/assets/worlds/${encodeURIComponent(safeStoryId(worldId))}/${encodeURIComponent(file)}`
}

export function assetUrl(
  storyId: string,
  name: string,
  type: keyof typeof ASSET_EXT,
): string {
  return storyAssetUrl(storyId, assetFileName(name, type))
}

export async function speechFileName(voice: string, caption: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${voice.trim()}\n${caption}`),
  )
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return `${hex.slice(0, 16)}.wav`
}

export function safeAssetFile(file: string): boolean {
  return /^[a-z0-9-]+\.(jpg|mp4|wav)$/.test(file)
}

export function assetContentType(file: string): string {
  if (file.endsWith('.mp4')) return 'video/mp4'
  if (file.endsWith('.wav')) return 'audio/wav'
  return 'image/jpeg'
}
