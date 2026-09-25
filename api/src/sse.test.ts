import { expect, test } from 'bun:test'
import { formatSse } from './sse'

test('sse frames name the event and json payload', () => {
  expect(formatSse('status', { phase: 'model', startedAt: 1 })).toBe(
    'event: status\ndata: {"phase":"model","startedAt":1}\n\n',
  )
  expect(formatSse('error', { error: 'nope' })).toBe(
    'event: error\ndata: {"error":"nope"}\n\n',
  )
})
