import { expect, test } from 'bun:test'
import { followUp, turnTiming } from './turn'

test('turn timing is seconds to two decimals', () => {
  expect(
    turnTiming({
      startedAt: 1_000,
      endedAt: 9_414,
      firstTokenAt: 1_424,
      modelMs: 2_200,
      completionTokens: 84,
      images: [6.123, 5.804],
    }),
  ).toEqual({ ttft: 0.42, total: 8.41, tps: 38.18, images: [6.12, 5.8] })
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
