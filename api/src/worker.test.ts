import { expect, test } from 'bun:test'
import { holdDatabase } from './worker'

function waiter(): {
  waitUntil: (promise: Promise<unknown>) => void
  waited: Promise<unknown>[]
} {
  const waited: Promise<unknown>[] = []
  return {
    waited,
    waitUntil(promise) {
      waited.push(promise)
    },
  }
}

test('the client stays open until the stream and later work finish', async () => {
  let closed = 0
  const background: Promise<unknown>[] = []
  const ctx = waiter()
  let push: (chunk: Uint8Array) => void = () => {}
  let end = () => {}
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (chunk) => controller.enqueue(chunk)
      end = () => controller.close()
    },
  })
  const response = holdDatabase(new Response(body), ctx, background, async () => {
    closed += 1
  })
  const reader = response.body?.getReader()
  if (!reader) throw new Error('missing body')
  push(new Uint8Array([1]))
  const first = await reader.read()
  expect(first.done).toBe(false)
  expect(closed).toBe(0)
  expect(ctx.waited).toHaveLength(0)
  let finish = () => {}
  background.push(
    new Promise<void>((resolve) => {
      finish = resolve
    }),
  )
  end()
  const last = await reader.read()
  expect(last.done).toBe(true)
  expect(closed).toBe(0)
  expect(ctx.waited).toHaveLength(1)
  finish()
  await ctx.waited[0]
  expect(closed).toBe(1)
})

test('work queued by background work finishes before close', async () => {
  let closed = 0
  const background: Promise<unknown>[] = []
  const ctx = waiter()
  let finish = () => {}
  const nested = new Promise<void>((resolve) => {
    finish = resolve
  })
  background.push(
    Promise.resolve().then(() => {
      background.push(nested)
    }),
  )
  const response = holdDatabase(new Response(null), ctx, background, async () => {
    closed += 1
  })
  expect(response.body).toBeNull()
  expect(closed).toBe(0)
  finish()
  await ctx.waited[0]
  expect(closed).toBe(1)
})

test('cancelling the stream closes the client once', async () => {
  let closed = 0
  const ctx = waiter()
  const response = holdDatabase(new Response('ok'), ctx, [], async () => {
    closed += 1
  })
  const reader = response.body?.getReader()
  if (!reader) throw new Error('missing body')
  await reader.cancel()
  await Promise.all(ctx.waited)
  expect(closed).toBe(1)
})
