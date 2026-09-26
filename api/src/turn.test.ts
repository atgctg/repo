import { expect, test } from 'bun:test'
import { followUp, llmMessages, turnTiming } from './turn'

test('the voice prompt is appended once any card has a voice and stays', () => {
  const system = (events: Parameters<typeof llmMessages>[0]) =>
    llmMessages(events, 'Test')[0]?.content ?? ''
  expect(
    system([
      { type: 'card', name: 'Mimi' },
      { type: 'input', text: 'hi' },
    ]),
  ).not.toContain('## Voice')
  expect(
    system([
      { type: 'card', name: 'Mimi', voice: 'Skylar' },
      { type: 'input', text: 'hi' },
    ]),
  ).toContain('## Voice')
  expect(
    system([
      { type: 'input', text: 'hi' },
      { type: 'card', name: 'Mimi', voice: 'Skylar' },
      { type: 'card', name: 'Mimi', voice: null },
    ]),
  ).toContain('## Voice')
})

test('turn timing is seconds to two decimals', () => {
  expect(
    turnTiming({
      startedAt: 1_000,
      endedAt: 9_414,
      firstTokenAt: 1_424,
      modelMs: 2_200,
      usage: { input: 0, output: 84, total: 0, cached: 0 },
      images: [6.123, 5.804],
    }),
  ).toEqual({ ttft: 0.42, total: 8.41, tps: 38.18, images: [6.12, 5.8] })
})

test('turn timing keeps the summed token usage', () => {
  const usage = { input: 1_714, output: 40, total: 1_754, cached: 857 }
  expect(
    turnTiming({ startedAt: 0, endedAt: 1_000, modelMs: 1_000, usage, images: [] }).usage,
  ).toEqual(usage)
})

test('a delete-only reply calls the model again', () => {
  expect(followUp([])).toBe(false)
  expect(followUp(['Dialogue'])).toBe(false)
  expect(followUp(['Image', 'Dialogue'])).toBe(false)
  expect(followUp(['Delete', 'Dialogue'])).toBe(false)
  expect(followUp(['Delete'])).toBe(true)
  expect(followUp(['Delete', 'Delete'])).toBe(true)
  expect(followUp(['Read'])).toBe(true)
  expect(followUp(['Delete', 'Read'])).toBe(true)
})
