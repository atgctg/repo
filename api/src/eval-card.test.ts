import { expect, test } from 'bun:test'
import type { StoryEvent } from 'shared'
import { oneLine, turnView } from './eval-card'

const events: StoryEvent[] = [
  { type: 'image', name: 'Tenno Sushi' },
  {
    type: 'dialogue',
    background: 'Booth wide',
    speaker: 'Yuki',
    caption: "Pretend you're\nmy boyfriend.",
  },
  { type: 'message', user: 'user', text: 'I forgot the plan.' },
  {
    type: 'dialogue',
    background: 'Booth wide',
    speaker: 'Leo',
    caption: 'Oh.. I must have forgotten',
  },
  { type: 'image', name: 'Leo Sweats' },
  { type: 'message', text: 'He keeps the line.' },
  { type: 'delete', indices: [0, 1] },
]

test('a turn is the last prompt and the model lines after it', () => {
  expect(turnView(events)).toEqual({
    prompt: 'I forgot the plan.',
    context: ['[0] image Tenno Sushi', "Yuki: Pretend you're my boyfriend."],
    output: [
      'Leo: Oh.. I must have forgotten',
      '[3] image Leo Sweats',
      'He keeps the line.',
      'delete 0-1',
    ],
  })
})

test('rules collapse onto one line', () => {
  expect(oneLine('Keep the wording.\nDo not rewrite it.')).toBe(
    'Keep the wording. Do not rewrite it.',
  )
})
