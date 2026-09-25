import { expect, test } from 'bun:test'
import { project, type StoryEvent } from 'shared'
import { scoreEvents, type Check } from './eval-score'
import { listCases, loadCase } from './eval'

test('a kept player line passes and a rewrite fails', () => {
  const checks: Check[] = [
    { kind: 'dialogue', speaker: 'Leo', has: 'forgotten', lacks: 'of course I knew' },
  ]
  const kept: StoryEvent[] = [
    {
      type: 'dialogue',
      background: 'Booth',
      speaker: 'Leo',
      caption: 'Oh.. I must have forgotten',
    },
  ]
  const rewritten: StoryEvent[] = [
    {
      type: 'dialogue',
      background: 'Booth',
      speaker: 'Leo',
      caption: 'Oh, of course I knew! I meant I forgot the restaurant name.',
    },
  ]
  expect(scoreEvents(kept, checks, 0).every((result) => result.ok)).toBe(true)
  expect(scoreEvents(rewritten, checks, 0).every((result) => result.ok)).toBe(false)
})

test('playtest replies fail the check they were saved for', async () => {
  const names = await listCases()
  expect(names.length).toBeGreaterThanOrEqual(6)
  for (const name of names) {
    const evalCase = await loadCase(name)
    const last = evalCase.events.at(-1)
    expect(last?.type).toBe('message')
    expect(last && 'user' in last ? last.user : undefined).toBe('user')
    const sceneCount = project(evalCase.events).scenes.length
    const results = scoreEvents(evalCase.model, evalCase.pass, sceneCount)
    expect(results.some((result) => !result.ok)).toBe(true)
  }
})
