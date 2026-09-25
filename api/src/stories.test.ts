import { beforeAll, expect, test } from 'bun:test'
import { useDatabase } from './db'
import {
  assetFileName,
  assetUrl,
  resolveAssetPath,
  storyAssetPath,
  worldAssetPath,
} from './files'
import { forkWorld, loadStory, StoryError } from './stories'
import { listWorlds, loadWorld } from './worlds'

beforeAll(() => {
  useDatabase(':memory:')
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
  expect(await Bun.file(storyAssetPath(story.id, 'pandoo.jpg')).exists()).toBe(false)
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

test('a story asset wins over the world asset', async () => {
  const story = await forkWorld('pandoo')
  const file = 'zz-fallback.jpg'
  const worldFile = worldAssetPath('pandoo', file)
  const storyFile = storyAssetPath(story.id, file)
  try {
    await Bun.write(worldFile, 'world')
    expect(await resolveAssetPath(story.id, story.world, file)).toBe(worldFile)
    await Bun.write(storyFile, 'story')
    expect(await resolveAssetPath(story.id, story.world, file)).toBe(storyFile)
    const name = 'Hooman'
    const image = assetFileName(name, 'image')
    const hooman = worldAssetPath('pandoo', image)
    const previous = (await Bun.file(hooman).exists())
      ? await Bun.file(hooman).bytes()
      : undefined
    try {
      await Bun.write(hooman, 'hooman')
      const loaded = await loadStory(story.id)
      const asset = loaded.assets.find((item) => item.name === name)
      expect(asset?.url).toBe(assetUrl(story.id, name, 'image'))
      expect(await Bun.file(storyAssetPath(story.id, image)).exists()).toBe(false)
    } finally {
      if (previous) await Bun.write(hooman, previous)
      else
        await Bun.file(hooman)
          .delete()
          .catch(() => undefined)
    }
  } finally {
    await Bun.file(worldFile)
      .delete()
      .catch(() => undefined)
    await Bun.file(storyFile)
      .delete()
      .catch(() => undefined)
  }
})
