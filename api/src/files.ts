export const REPO_ROOT = `${import.meta.dir}/../..`
export const DATA_DIR = `${REPO_ROOT}/data`
export const WORLDS_DIR = `${DATA_DIR}/worlds`
export const ASSETS_DIR = `${DATA_DIR}/assets`

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
  return `${ASSETS_DIR}/stories/${safeStoryId(storyId)}/${file}`
}

export function worldAssetPath(worldId: string, file: string): string {
  return `${ASSETS_DIR}/worlds/${safeStoryId(worldId)}/${file}`
}

export function assetDiskPath(
  storyId: string,
  name: string,
  type: keyof typeof ASSET_EXT,
): string {
  return storyAssetPath(storyId, assetFileName(name, type))
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

export function speechFileName(voice: string, caption: string): string {
  const hex = new Bun.CryptoHasher('sha256')
    .update(`${voice.trim()}\n${caption}`)
    .digest('hex')
    .slice(0, 16)
  return `${hex}.wav`
}

export function safeAssetFile(file: string): boolean {
  return /^[a-z0-9-]+\.(jpg|mp4|wav)$/.test(file)
}

export async function resolveAssetPath(
  storyId: string,
  worldId: string,
  file: string,
): Promise<string | undefined> {
  const own = storyAssetPath(storyId, file)
  if (await Bun.file(own).exists()) return own
  if (!worldId) return undefined
  const shared = worldAssetPath(worldId, file)
  if (await Bun.file(shared).exists()) return shared
  return undefined
}
