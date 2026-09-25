import { beforeAll, expect, test } from 'bun:test'
import { adminOk } from './auth'
import { resolveAssetKey, storyKey, worldKey } from './assets'
import { app } from './context'
import { assetFileName, assetUrl } from './files'
import { useMemoryDatabase } from './memory-db'
import { handle } from './server'
import { forkWorld, loadStory, saveTiming, StoryError } from './stories'
import { listWorlds, loadWorld } from './worlds'

beforeAll(async () => {
  await useMemoryDatabase()
})

test('kept worlds are seeds', async () => {
  const worlds = await listWorlds()
  expect(worlds.map((world) => world.id)).toEqual(['her-fake-boyfriend', 'pandoo'])
  for (const world of worlds) {
    const source = await loadWorld(world.id)
    expect(source?.events.some((event) => event.type === 'input')).toBe(false)
  }
  const hook = await loadWorld('her-fake-boyfriend')
  const last = hook?.events.at(-1)
  expect(last?.type).toBe('dialogue')
  if (last?.type === 'dialogue')
    expect(last.caption).toContain("Pretend you're my boyfriend")
})

test('fork copies the world and no files', async () => {
  const world = await loadWorld('pandoo')
  const story = await forkWorld('pandoo')
  expect(story.world).toBe('pandoo')
  expect(story.id).toMatch(/^pandoo-[a-z0-9]{4}$/)
  expect(story.events).toEqual(world?.events)
  expect(await app().assets.head(storyKey(story.id, 'pandoo.jpg'))).toBeNull()
  const again = await forkWorld('pandoo')
  expect(again.id).not.toBe(story.id)
  const same = await forkWorld('pandoo', story.id)
  expect(same.id).toBe(story.id)
  await expect(forkWorld('missing')).rejects.toBeInstanceOf(StoryError)
  await expect(forkWorld('pandoo', '../nope')).rejects.toBeInstanceOf(StoryError)
  await expect(forkWorld('her-fake-boyfriend', story.id)).rejects.toBeInstanceOf(
    StoryError,
  )
})

test('latest turn timing reloads with the story', async () => {
  const story = await forkWorld('pandoo')
  const timing = { ttft: 0.42, total: 8.41, tps: 38.2, images: [6.12, 5.8] }
  saveTiming(story.id, timing)
  expect((await loadStory(story.id)).timing).toEqual(timing)
})

test('a story asset wins over the world asset', async () => {
  const story = await forkWorld('pandoo')
  const file = 'zz-fallback.jpg'
  const store = app().assets
  const jpeg = { httpMetadata: { contentType: 'image/jpeg' } }
  await store.put(worldKey('pandoo', file), new TextEncoder().encode('world'), jpeg)
  expect(await resolveAssetKey(store, story.id, story.world, file)).toBe(
    worldKey('pandoo', file),
  )
  await store.put(storyKey(story.id, file), new TextEncoder().encode('story'), jpeg)
  expect(await resolveAssetKey(store, story.id, story.world, file)).toBe(
    storyKey(story.id, file),
  )
  const name = 'Hooman'
  const image = assetFileName(name, 'image')
  await store.put(worldKey('pandoo', image), new TextEncoder().encode('hooman'), jpeg)
  const loaded = await loadStory(story.id)
  const asset = loaded.assets.find((item) => item.name === name)
  expect(asset?.url).toBe(assetUrl(story.id, name, 'image'))
  expect(await store.head(storyKey(story.id, image))).toBeNull()
})

test('asset routes fall back from the story to its world', async () => {
  const story = await forkWorld('pandoo')
  await app().assets.put(
    worldKey('pandoo', 'cover.jpg'),
    new TextEncoder().encode('cover'),
    {
      httpMetadata: { contentType: 'image/jpeg' },
    },
  )
  const response = await handle(
    new Request(`http://verse.test/assets/${story.id}/cover.jpg`),
  )
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('cover')
  const worlds = await handle(new Request('http://verse.test/api/worlds'))
  expect(worlds.status).toBe(200)
  const listed = (await worlds.json()) as { id: string }[]
  expect(listed.map((world) => world.id)).toEqual(['her-fake-boyfriend', 'pandoo'])
})

test('admin password is a bearer token', () => {
  const request = (authorization?: string) =>
    new Request('http://verse.test/api/worlds', {
      headers: authorization ? { Authorization: authorization } : {},
    })
  expect(adminOk(request(), 'secret')).toBe(false)
  expect(adminOk(request('Bearer no'), 'secret')).toBe(false)
  expect(adminOk(request('Bearer secret'), undefined)).toBe(false)
  expect(adminOk(request('Bearer secret'), 'secret')).toBe(true)
})
