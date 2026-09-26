import { beforeAll, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { createORPCClient, ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterContractClient } from '@orpc/contract'
import { createFrameClient, FRAME_ROUTES } from 'shared'
import { contract, type Contract } from 'shared/contract'
import { listEvalWorlds } from '~/scripts/eval'
import { adminOk } from './auth'
import { resolveAssetKey, storyKey, worldKey } from './assets'
import { app } from './context'
import { assetFileName, storyAssetUrl, worldAssetUrl } from './files'
import { useMemoryDatabase } from './memory-db'
import { handle } from './server'
import { database } from './db'
import { listEvalRuns, setVerdict } from './eval-runs'
import { evals, feedback } from './schema'
import { forkWorld, loadStory, saveEvalStory, saveTiming, StoryError } from './stories'
import { listWorlds, loadWorld } from './worlds'

const seededIds = ['camp', 'cafe', 'ship', 'noir']

beforeAll(async () => {
  await useMemoryDatabase()
})

test('listed worlds are sorted by title and load their events', async () => {
  const worlds = await listWorlds()
  expect(worlds.map((world) => world.id)).toEqual(seededIds)
  const files = new Map((await listEvalWorlds()).map((file) => [file.id, file]))
  for (const world of worlds) {
    const source = await loadWorld(world.id)
    expect(source?.title).toBe(world.title)
    expect(source?.events).toEqual(files.get(world.id)?.events ?? [])
  }
  expect(await loadWorld('missing')).toBeUndefined()
})

test('fork copies the world and no files', async () => {
  const world = await loadWorld('noir')
  const story = await forkWorld('noir')
  expect(story.world).toBe('noir')
  expect(story.id).toMatch(/^noir-[a-z0-9]{4}$/)
  expect(story.events).toEqual(world?.events ?? [])
  expect(await app().assets.head(storyKey(story.id, 'noir.jpg'))).toBeNull()
  const again = await forkWorld('noir')
  expect(again.id).not.toBe(story.id)
  const same = await forkWorld('noir', story.id)
  expect(same.id).toBe(story.id)
  await expect(forkWorld('missing')).rejects.toBeInstanceOf(StoryError)
  await expect(forkWorld('noir', '../nope')).rejects.toBeInstanceOf(StoryError)
  await expect(forkWorld('cafe', story.id)).rejects.toBeInstanceOf(StoryError)
})

test('latest turn timing reloads with the story', async () => {
  const story = await forkWorld('noir')
  const timing = { ttft: 0.42, total: 8.41, tps: 38.2, images: [6.12, 5.8] }
  await saveTiming(story.id, timing)
  expect((await loadStory(story.id)).timing).toEqual(timing)
})

test('a story asset wins over the world asset', async () => {
  const story = await forkWorld('noir')
  const file = 'zz-fallback.jpg'
  const store = app().assets
  const jpeg = { httpMetadata: { contentType: 'image/jpeg' } }
  await store.put(worldKey('noir', file), new TextEncoder().encode('world'), jpeg)
  expect(await resolveAssetKey(store, story.id, story.world, file)).toBe(
    worldKey('noir', file),
  )
  await store.put(storyKey(story.id, file), new TextEncoder().encode('story'), jpeg)
  expect(await resolveAssetKey(store, story.id, story.world, file)).toBe(
    storyKey(story.id, file),
  )
  const name = 'Rosa At Desk'
  const image = assetFileName(name, 'image')
  await store.put(worldKey('noir', image), new TextEncoder().encode('rosa'), jpeg)
  const urlOf = async () =>
    (await loadStory(story.id)).assets.find((item) => item.name === name)?.url
  expect(await urlOf()).toBe(worldAssetUrl('noir', image))
  expect(await store.head(storyKey(story.id, image))).toBeNull()
  await store.put(storyKey(story.id, image), new TextEncoder().encode('own'), jpeg)
  expect(await urlOf()).toBe(storyAssetUrl(story.id, image))
})

test('asset routes fall back from the story to its world', async () => {
  const story = await forkWorld('noir')
  await app().assets.put(
    worldKey('noir', 'cover.jpg'),
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
})

const api: RouterContractClient<Contract> = createORPCClient(
  new RPCLink({
    origin: 'http://verse.test',
    url: '/api',
    fetch: (url, init) => handle(new Request(url, init)),
  }),
)

test('rpc procedures answer over the fetch handler', async () => {
  const listed = await api.worlds.list()
  expect(listed.map((world) => world.id)).toEqual(seededIds)
  const story = await api.worlds.fork({ world: 'noir' })
  expect((await api.stories.get({ id: story.id })).world).toBe('noir')
  const missing = await api.stories
    .get({ id: 'missing' })
    .catch((error: unknown) => error)
  expect(missing).toBeInstanceOf(ORPCError)
  expect((missing as ORPCError<string, unknown>).code).toBe('NOT_FOUND')
})

test('feedback snapshots the story events', async () => {
  const story = await forkWorld('noir')
  const receipt = await api.feedback.create({ story: story.id, text: '  too slow  ' })
  const rows = await database().select().from(feedback).where(eq(feedback.id, receipt.id))
  expect(rows).toHaveLength(1)
  expect(rows[0]?.storyId).toBe(story.id)
  expect(rows[0]?.world).toBe('noir')
  expect(rows[0]?.text).toBe('too slow')
  expect(rows[0]?.events).toEqual(story.events)
  expect(rows[0]?.createdAt.toISOString()).toBe(receipt.createdAt)
  const missing = await api.feedback
    .create({ story: 'missing', text: 'hi' })
    .catch((error: unknown) => error)
  expect((missing as ORPCError<string, unknown>).code).toBe('NOT_FOUND')
  await expect(api.feedback.create({ story: story.id, text: ' ' })).rejects.toThrow()
})

test('turn frames reject bad input and unknown stories before streaming', async () => {
  const frames = createFrameClient({
    url: 'http://verse.test/api',
    fetch: (request) => handle(request),
  })
  const story = await forkWorld('noir')
  await expect(frames.turn({ id: story.id, text: '  ' }).next()).rejects.toThrow(
    'text is required',
  )
  await expect(frames.turn({ id: 'missing', text: 'Hi' }).next()).rejects.toThrow(
    'Story not found',
  )
  await expect(frames.evalRun({ name: 'missing' }).next()).rejects.toThrow(
    'Eval not found',
  )
  const post = (route: string, body: unknown) =>
    handle(
      new Request(`http://verse.test/api/${route}`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    )
  const turn = await post(FRAME_ROUTES.turn, { id: 'missing', text: 'Hi' })
  expect(turn.status).toBe(404)
  const evalRun = await post(FRAME_ROUTES.evalRun, { name: 'missing' })
  expect(evalRun.status).toBe(404)
  expect(await evalRun.json()).toEqual({ error: 'Eval not found' })
})

test('video duration is left to the asset when omitted', async () => {
  const [schema] = contract.stories.generateVideo['~orpc'].inputSchemas ?? []
  const parse = async (value: unknown) => schema?.['~standard'].validate(value)
  expect(await parse({ id: 'story', name: 'Clip' })).toEqual({
    value: { id: 'story', name: 'Clip' },
  })
  expect(await parse({ id: 'story', name: 'Clip', duration: 8 })).toEqual({
    value: { id: 'story', name: 'Clip', duration: 8 },
  })
})

test('eval runs list their case and keep a verdict', async () => {
  await database()
    .insert(evals)
    .values({
      name: 'your-line',
      description: 'The typed line\nis not repeated.',
      world: 'noir',
      events: [],
      input: { text: 'Hi' },
    })
  const id = await saveEvalStory('your-line', 'noir', [])
  await setVerdict(id, 'pass')
  expect(await listEvalRuns()).toEqual([
    {
      id,
      caseName: 'your-line',
      description: 'The typed line is not repeated.',
      verdict: 'pass',
    },
  ])
  const story = await forkWorld('noir')
  await expect(setVerdict(story.id, 'fail')).rejects.toBeInstanceOf(StoryError)
})

test('admin password is a bearer token', async () => {
  const request = (authorization?: string) =>
    new Request('http://verse.test/api/worlds', {
      headers: authorization ? { Authorization: authorization } : {},
    })
  expect(await adminOk(request(), 'secret')).toBe(false)
  expect(await adminOk(request('Bearer no'), 'secret')).toBe(false)
  expect(await adminOk(request('Bearer secret'), undefined)).toBe(false)
  expect(await adminOk(request('Bearer secret'), 'secret')).toBe(true)
})
