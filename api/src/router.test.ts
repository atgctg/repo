import { expect, test } from 'bun:test'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { os, type RouterClient } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import type { TurnMessage } from 'shared'
import { turnEvents } from './router'

test('turn events arrive one by one as they are sent', async () => {
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const events = turnEvents(async (send) => {
    send({ type: 'start', turn: 1, keep: 0 })
    await gate
    send({ type: 'done', ms: 5 })
  })
  expect((await events.next()).value).toEqual({ type: 'start', turn: 1, keep: 0 })
  const pending = events.next()
  release()
  expect((await pending).value).toEqual({ type: 'done', ms: 5 })
  expect((await events.next()).done).toBe(true)
})

test('closing the events aborts the turn', async () => {
  let stopped: AbortSignal | undefined
  const events = turnEvents(async (send, signal) => {
    stopped = signal
    send({ type: 'status', phase: 'model' })
    await new Promise((resolve) => signal.addEventListener('abort', resolve))
  })
  const first: IteratorResult<TurnMessage> = await events.next()
  expect(first.value).toEqual({ type: 'status', phase: 'model' })
  await events.return(undefined)
  expect(stopped?.aborted).toBe(true)
})

test('rpc streams each turn event before the next one exists', async () => {
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const turn = os.handler(() =>
    turnEvents(async (send) => {
      send({ type: 'start', turn: 1, keep: 0 })
      await gate
      send({ type: 'done', ms: 5 })
    }),
  )
  const handler = new RPCHandler({ turn })
  const client: RouterClient<{ turn: typeof turn }> = createORPCClient(
    new RPCLink({
      origin: 'http://verse.test',
      url: '/api',
      fetch: async (url, init) =>
        (await handler.handle(new Request(url, init), { prefix: '/api' })).response ??
        new Response(null, { status: 404 }),
    }),
  )
  const events = await client.turn()
  expect((await events.next()).value).toEqual({ type: 'start', turn: 1, keep: 0 })
  release()
  expect((await events.next()).value).toEqual({ type: 'done', ms: 5 })
})
