import { safeStoryId } from './files'

export type AssetObject = {
  body: ReadableStream | null
  arrayBuffer: () => Promise<ArrayBuffer>
  writeHttpMetadata: (headers: Headers) => void
}

export type AssetStore = {
  get: (key: string) => Promise<AssetObject | null>
  head: (key: string) => Promise<unknown | null>
  put: (
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>
}

export function worldKey(worldId: string, file: string): string {
  return `worlds/${safeStoryId(worldId)}/${file}`
}

export function storyKey(storyId: string, file: string): string {
  return `stories/${safeStoryId(storyId)}/${file}`
}

export async function assetExists(store: AssetStore, key: string): Promise<boolean> {
  return (await store.head(key)) !== null
}

export async function resolveAssetKey(
  store: AssetStore,
  storyId: string,
  worldId: string,
  file: string,
): Promise<string | undefined> {
  const own = storyKey(storyId, file)
  if (await assetExists(store, own)) return own
  if (!worldId) return undefined
  const shared = worldKey(worldId, file)
  if (await assetExists(store, shared)) return shared
  return undefined
}

export async function readAssetBytes(
  store: AssetStore,
  key: string,
): Promise<ArrayBuffer | undefined> {
  const object = await store.get(key)
  if (!object) return undefined
  return object.arrayBuffer()
}

export async function writeAsset(
  store: AssetStore,
  key: string,
  bytes: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await store.put(key, bytes, { httpMetadata: { contentType } })
}

export function memoryAssets(): AssetStore {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>()
  return {
    async get(key) {
      const item = objects.get(key)
      if (!item) return null
      const bytes = new Uint8Array(item.bytes.byteLength)
      bytes.set(item.bytes)
      return {
        body: new Blob([bytes]).stream(),
        async arrayBuffer() {
          return bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer
        },
        writeHttpMetadata(headers) {
          headers.set('Content-Type', item.contentType)
        },
      }
    },
    async head(key) {
      return objects.has(key) ? { key } : null
    },
    async put(key, value, options) {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
      objects.set(key, {
        bytes,
        contentType: options?.httpMetadata?.contentType ?? 'application/octet-stream',
      })
    },
  }
}
