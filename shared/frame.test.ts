import { expect, test } from 'bun:test'
import { concatBytes, decodeFrames, encodeFrame, readTurn, turnResponse } from './frame'
import type { TurnMessage } from './turn'

const messages: TurnMessage[] = [
  { type: 'start', turn: 4, keep: 2 },
  { type: 'event', at: 2, event: { type: 'input', text: 'Hello' } },
  { type: 'status', phase: 'image', name: 'Cafe' },
  { type: 'done', ms: 12 },
]

test('decode resumes across chunk boundaries', () => {
  const bytes = concatBytes(messages.map((message) => encodeFrame(message)))
  const cuts = [1, 3, 5, 8, Math.floor(bytes.byteLength / 2), bytes.byteLength - 1]
  for (const cut of cuts) {
    const head = decodeFrames(bytes.subarray(0, cut))
    const tail = decodeFrames(concatBytes([head.rest, bytes.subarray(cut)]))
    expect([...head.messages, ...tail.messages]).toEqual(messages)
    expect(tail.rest.byteLength).toBe(0)
  }
})

test('a response body decodes one event per frame', async () => {
  const response = turnResponse((send) => {
    send(messages[0]!)
    send(messages[1]!)
    send({ type: 'done', ms: 3 })
    return Promise.resolve()
  })
  expect(response.headers.get('Content-Type')).toBe('application/octet-stream')
  const got: TurnMessage[] = []
  if (!response.body) throw new Error('missing body')
  await readTurn(response.body, (message) => got.push(message))
  expect(got).toEqual([messages[0], messages[1], { type: 'done', ms: 3 }])
})

test('a reserved byte frame is skipped', () => {
  const payload = new Uint8Array([1, 2, 3, 4])
  const raw = new Uint8Array(5 + payload.byteLength)
  const view = new DataView(raw.buffer)
  view.setUint8(0, 2)
  view.setUint32(1, payload.byteLength, false)
  raw.set(payload, 5)
  const bytes = concatBytes([encodeFrame(messages[0]!), raw, encodeFrame(messages[1]!)])
  const split = decodeFrames(bytes.subarray(0, 7))
  const rest = decodeFrames(concatBytes([split.rest, bytes.subarray(7)]))
  expect([...split.messages, ...rest.messages]).toEqual([messages[0], messages[1]])
})
