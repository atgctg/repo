import { expect, test } from 'bun:test'
import { followUp } from './turn'

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
