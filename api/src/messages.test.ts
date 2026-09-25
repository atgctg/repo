import { expect, test } from 'bun:test'
import type { StoryEvent } from 'shared'
import { eventsToMessages } from './messages'

const prefix: StoryEvent[] = [
  {
    type: 'card',
    name: 'Yuki',
    cover: 'Yuki',
    voice: 'Aiko',
    attributes: { Info: { Age: '22' }, Look: { Hair: 'Dark, white ribbon' } },
  },
  { type: 'image', name: 'Tenno Sushi' },
  {
    type: 'dialogue',
    background: 'Booth wide',
    speaker: 'Yuki',
    caption: "Pretend you're my boyfriend.",
  },
]

const ask: StoryEvent = { type: 'input', text: 'I forgot the plan.' }

const template = `<template title="Her Fake Boyfriend">
<cards>
- name: Yuki
  cover: Yuki
  voice: Aiko
  attributes: {"Info":{"Age":"22"},"Look":{"Hair":"Dark, white ribbon"}}
</cards>
<scenes>
[0] image Tenno Sushi
[1] dialogue Booth wide
Yuki
Pretend you're my boyfriend.
</scenes>
</template>`

const opening = [...prefix, ask]

test('the opening is one template block', () => {
  expect(eventsToMessages(opening, undefined, 'Her Fake Boyfriend')).toEqual([
    {
      role: 'user',
      name: 'user',
      content: `${template}\n\nI forgot the plan.`,
    },
  ])
})

test('later turns keep the same template bytes', () => {
  const events: StoryEvent[] = [
    ...opening,
    {
      type: 'dialogue',
      background: 'Booth wide',
      speaker: 'Leo',
      caption: 'Right.',
    },
    { type: 'input', text: 'again' },
  ]
  const first = eventsToMessages(opening, undefined, 'Her Fake Boyfriend')
  const full = eventsToMessages(events, undefined, 'Her Fake Boyfriend')
  expect(full[0]).toEqual(first[0])
  expect(full.at(-1)).toEqual({ role: 'user', name: 'user', content: 'again' })
})

test('a finished turn is a stable prefix', () => {
  const events: StoryEvent[] = [
    ...opening,
    {
      type: 'dialogue',
      background: 'Booth wide',
      speaker: 'Leo',
      caption: 'Right.',
    },
    { type: 'input', text: 'again' },
  ]
  const full = eventsToMessages(events, undefined, 'Her Fake Boyfriend')
  const cuts = [0]
  for (let index = 0; index < events.length; index++) {
    const next = events[index + 1]
    const model = events[index].type !== 'input'
    const nextModel = next ? next.type !== 'input' : false
    if (!next || !model || !nextModel) cuts.push(index + 1)
  }
  for (const count of cuts) {
    const head = eventsToMessages(events.slice(0, count), undefined, 'Her Fake Boyfriend')
    expect(full.slice(0, head.length)).toEqual(head)
  }
})

test('summary is a frozen prefix', () => {
  const summary = 'Summary of earlier events.'
  const withSummary = eventsToMessages(opening, summary, 'Her Fake Boyfriend')
  expect(withSummary[0]).toEqual({ role: 'system', content: summary })
  expect(withSummary.slice(1)).toEqual(
    eventsToMessages(opening, undefined, 'Her Fake Boyfriend'),
  )
})

test('a title escapes quotes and ampersands', () => {
  const framed = eventsToMessages(
    [...prefix.slice(0, 1), { type: 'input', text: 'go' }],
    undefined,
    'A & B "C"',
  )
  const content = framed[0]?.role === 'user' ? framed[0].content : ''
  expect(content.startsWith('<template title="A &amp; B &quot;C&quot;">')).toBe(true)
})

test('an empty prefix has no template wrapper', () => {
  expect(eventsToMessages([{ type: 'input', text: 'go' }], undefined, 'Title')).toEqual([
    { role: 'user', name: 'user', content: 'go' },
  ])
})

test('a failed tool returns the error and keeps the prompt', () => {
  const failed: StoryEvent[] = [
    { type: 'input', text: 'go' },
    {
      type: 'image',
      name: 'Night',
      prompt: { Subject: 'Night' },
      references: ['Cafe'],
      width: 720,
      error: 'safety filter',
    },
  ]
  const messages = eventsToMessages(failed)
  const turn = messages.find(
    (message) => message.role === 'assistant' && message.tool_calls,
  )
  const call = turn?.role === 'assistant' ? turn.tool_calls?.[0] : undefined
  expect(call?.function.arguments).toBe(
    '{"name":"Night","prompt":{"Subject":"Night"},"references":["Cafe"]}',
  )
  expect(messages.find((message) => message.role === 'tool')).toEqual({
    role: 'tool',
    tool_call_id: '0',
    content: 'safety filter',
  })
})

test('selected scenes are formatted onto the input', () => {
  expect(eventsToMessages([{ type: 'input', text: 'fix it', selected: [1, 2] }])).toEqual(
    [
      {
        role: 'user',
        name: 'user',
        content: '<selected>\n1-2\n</selected>\nfix it',
      },
    ],
  )
})
