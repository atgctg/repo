import { expect, test } from 'bun:test'
import { caseEvents, listCases, loadCase } from './eval'

test('a case is the world, then earlier play, then the input', async () => {
  const events = await caseEvents('your-line')
  expect(events[0]).toMatchObject({ type: 'card', name: 'Style' })
  expect(events.at(-1)).toEqual({
    type: 'input',
    text: "I don't find people anymore, Rosa.",
  })
  const selected = await caseEvents('selected-only')
  expect(selected.at(-1)).toEqual({
    type: 'input',
    text: 'make her angrier',
    selected: [4],
  })
  const history = await caseEvents('who-you-play-history')
  expect(history.filter((event) => event.type === 'input')).toHaveLength(3)
  expect(history.at(-1)).toMatchObject({ text: 'Good. Nobody sleeps until we dock.' })
})

test('every case and world fits the event types', async () => {
  const names = await listCases()
  expect(names).toHaveLength(21)
  for (const name of names) {
    const evalCase = await loadCase(name)
    expect(evalCase.description.length).toBeGreaterThan(0)
    await caseEvents(name)
  }
})
