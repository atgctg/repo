export const STORIES_DIR = `${import.meta.dir}/../stories`

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

export function storyAssetPath(storyId: string, file: string): string {
  return `${STORIES_DIR}/assets/${safeStoryId(storyId)}/${file}`
}

export function assetDiskPath(
  storyId: string,
  name: string,
  type: keyof typeof ASSET_EXT,
): string {
  return storyAssetPath(storyId, assetFileName(name, type))
}

export function assetUrl(
  storyId: string,
  name: string,
  type: keyof typeof ASSET_EXT,
): string {
  return `/assets/${encodeURIComponent(safeStoryId(storyId))}/${encodeURIComponent(assetFileName(name, type))}`
}

export function speechFileName(voice: string, caption: string): string {
  const hex = new Bun.CryptoHasher('sha256')
    .update(`${voice.trim()}\n${caption}`)
    .digest('hex')
    .slice(0, 16)
  return `${hex}.wav`
}
