import { expect, test } from 'bun:test'
import { formatRanges, leadCards, project } from './project'
import type { StoryEvent } from './types'

test('projects scenes from events and skips failures', () => {
  const events: StoryEvent[] = [
    { type: 'message', user: 'user', text: 'User message' },
    { type: 'image', name: 'Cafe', prompt: { Subject: 'Cafe' } },
    { type: 'dialogue', background: 'Cafe', speaker: 'Mimi', caption: 'Hello' },
    {
      type: 'image',
      name: 'Night',
      prompt: { Subject: 'Night' },
      error: 'safety filter',
    },
    {
      type: 'dialogue',
      replace: true,
      index: 1,
      background: 'Cafe',
      speaker: 'Mimi',
      caption: 'Tea',
    },
    { type: 'delete', indices: [0] },
    { type: 'card', name: 'Mimi', voice: 'Skylar', attributes: { Hair: 'braid' } },
    { type: 'card', name: 'Mimi', voice: null, attributes: { Hair: null, Goal: 'tea' } },
  ]
  const state = project(events)
  expect(state.scenes).toEqual([
    { type: 'dialogue', background: 'Cafe', speaker: 'Mimi', caption: 'Tea', event: 4 },
  ])
  expect(state.assets).toEqual([
    { type: 'image', name: 'Cafe', prompt: { Subject: 'Cafe' } },
  ])
  expect(state.cards).toEqual([{ name: 'Mimi', attributes: { Goal: 'tea' } }])
})

test('cards lead the log unless a user asked for one', () => {
  const events: StoryEvent[] = [
    { type: 'image', name: 'Cafe' },
    { type: 'card', name: 'Mimi', voice: 'Skylar' },
    { type: 'message', user: 'user', text: 'Make a card for Yoyo' },
    { type: 'card', name: 'Yoyo' },
  ]
  const ordered = leadCards(events)
  expect(
    ordered.map((event) =>
      event.type === 'message'
        ? event.text
        : event.type === 'card' || event.type === 'image'
          ? event.name
          : '',
    ),
  ).toEqual(['Mimi', 'Cafe', 'Make a card for Yoyo', 'Yoyo'])
  expect(leadCards(ordered)).toBe(ordered)
})

test('events point at the scene they still own', () => {
  const events: StoryEvent[] = [
    { type: 'image', name: 'Cafe' },
    { type: 'dialogue', background: 'Cafe', caption: 'Hello' },
    { type: 'dialogue', replace: true, index: 1, background: 'Cafe', caption: 'Tea' },
    { type: 'delete', indices: [0] },
  ]
  expect(project(events).scenes).toEqual([
    { type: 'dialogue', background: 'Cafe', caption: 'Tea', event: 2 },
  ])
})

test('selection ranges collapse runs', () => {
  expect(formatRanges([8, 9, 10, 12, 15, 16, 17, 25])).toBe('8-10,12,15-17,25')
})
