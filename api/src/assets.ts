import { safeStoryId } from './files'

export type AssetHead = {
  httpEtag: string
  writeHttpMetadata: (headers: Headers) => void
}

export type AssetObject = AssetHead & {
  body: ReadableStream
  arrayBuffer: () => Promise<ArrayBuffer>
}

export type AssetPage = {
  objects: { key: string }[]
  truncated: boolean
  cursor?: string
}

export type AssetStore = {
  get: (
    key: string,
    options?: { onlyIf?: Headers },
  ) => Promise<AssetObject | AssetHead | null>
  head: (key: string) => Promise<AssetHead | null>
  list: (options: { prefix: string; cursor?: string }) => Promise<AssetPage>
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

export function worldPrefix(worldId: string): string {
  return `worlds/${safeStoryId(worldId)}/`
}

export function storyPrefix(storyId: string): string {
  return `stories/${safeStoryId(storyId)}/`
}

export function hasBody(object: AssetObject | AssetHead): object is AssetObject {
  return 'body' in object && object.body !== null
}

export async function assetExists(store: AssetStore, key: string): Promise<boolean> {
  return (await store.head(key)) !== null
}

export async function listAssetKeys(
  store: AssetStore,
  prefixes: string[],
): Promise<Set<string>> {
  const pages = await Promise.all(
    prefixes.map(async (prefix) => {
      const keys: string[] = []
      let cursor: string | undefined
      do {
        const page = await store.list(cursor ? { prefix, cursor } : { prefix })
        for (const object of page.objects) keys.push(object.key)
        cursor = page.truncated ? page.cursor : undefined
      } while (cursor)
      return keys
    }),
  )
  return new Set(pages.flat())
}

export function storyAssetKeys(
  store: AssetStore,
  storyId: string,
  worldId: string,
): Promise<Set<string>> {
  return listAssetKeys(
    store,
    worldId ? [storyPrefix(storyId), worldPrefix(worldId)] : [storyPrefix(storyId)],
  )
}

export function pickAssetKey(
  keys: Set<string>,
  storyId: string,
  worldId: string,
  file: string,
): string | undefined {
  const own = storyKey(storyId, file)
  if (keys.has(own)) return own
  if (!worldId) return undefined
  const shared = worldKey(worldId, file)
  return keys.has(shared) ? shared : undefined
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
  if (!object || !hasBody(object)) return undefined
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
  const headOf = (key: string, contentType: string): AssetHead => ({
    httpEtag: `"${key}"`,
    writeHttpMetadata(headers) {
      headers.set('Content-Type', contentType)
    },
  })
  return {
    async get(key, options) {
      const item = objects.get(key)
      if (!item) return null
      const head = headOf(key, item.contentType)
      if (options?.onlyIf?.get('If-None-Match') === head.httpEtag) return head
      const bytes = new Uint8Array(item.bytes.byteLength)
      bytes.set(item.bytes)
      return {
        ...head,
        body: new Blob([bytes]).stream(),
        async arrayBuffer() {
          return bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer
        },
      }
    },
    async head(key) {
      const item = objects.get(key)
      return item ? headOf(key, item.contentType) : null
    },
    async list({ prefix }) {
      return {
        objects: [...objects.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((key) => ({ key })),
        truncated: false,
      }
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
