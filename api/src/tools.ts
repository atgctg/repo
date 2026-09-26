import {
  isPlainObject,
  normalizeRecord,
  type CardEvent,
  type DeleteEvent,
  type DialogueEvent,
  type ImageEvent,
  type StoryEvent,
  type VideoEvent,
} from 'shared'
import { cardLinks } from './events'

export const STORY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'Image',
      description:
        'Create an image only when no existing image can show this shot. Create it before the dialogue that needs it.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Reusable shot: who, where, and the angle. Not a one-off moment. The same name overwrites that shot.',
          },
          prompt: {
            type: 'object',
            description:
              'Object with Shot, Setting, Subjects, and optional Text. Values are full sentences.',
          },
          references: {
            type: 'array',
            items: { type: 'string' },
            description: 'Existing image names to edit from (max 5).',
          },
          index: {
            type: 'integer',
            description: '0-based scene index to insert before. Omit to append.',
          },
          replace: { type: 'boolean', description: 'Overwrite the scene at index.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'Dialogue',
      description: 'Add dialogue on top of an existing image.',
      parameters: {
        type: 'object',
        properties: {
          background: {
            type: 'string',
            description: 'Existing image name to show behind the caption.',
          },
          speaker: {
            type: 'string',
            description: 'Speaker character name. Leave empty for narration.',
          },
          caption: {
            type: 'string',
            description:
              'Dialogue lines, each below 70 chars. Split longer speech at natural pauses. Actions are separate lines wrapped in *asterisks*. Never surround lines with quotation marks.',
          },
          index: {
            type: 'integer',
            description: '0-based scene index to insert before. Omit to append.',
          },
          replace: { type: 'boolean', description: 'Overwrite the scene at index.' },
        },
        required: ['background'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'Video',
      description: 'IF_ASKED Generate a video.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          prompt: {
            type: 'object',
            description: 'Suggested fields: Subject, Actions, Camera, Audio.',
          },
          firstFrame: {
            type: 'string',
            description: 'Image name used for the first frame.',
          },
          lastFrame: {
            type: 'string',
            description: 'Image name used for the last frame.',
          },
          duration: { type: 'integer', description: 'Seconds from 5 to 15.' },
          index: { type: 'integer' },
          replace: { type: 'boolean' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'Card',
      description:
        'Create or patch a card for a recurring character, place, or lasting fact.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Use the same name you use as the speaker in dialogue',
          },
          cover: {
            type: ['string', 'null'],
            description: 'Existing image name, or null to clear.',
          },
          voice: {
            type: ['string', 'null'],
            enum: ['Skylar', 'Daniel', 'Jacqueline', 'Gemma', 'Archie', 'Aiko', null],
            description: 'IF_ASKED Voice for dialogue captions.',
          },
          attributes: {
            type: 'object',
            description: 'Deep-merged patch. Null deletes a field.',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'Delete',
      description:
        'Delete scenes by index. If the user wants the story to go on, write the replacement in this same turn.',
      parameters: {
        type: 'object',
        properties: {
          indices: {
            type: 'array',
            items: { type: 'integer' },
            description: '0-based scene indices. Negative counts from the end.',
          },
        },
        required: ['indices'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'Read',
      description: 'Read scenes already in the story.',
      parameters: {
        type: 'object',
        properties: {
          offset: {
            type: 'integer',
            description: 'Start index. Negative counts from the end.',
          },
          limit: { type: 'integer' },
          last: { type: 'integer', description: 'Number of recent scenes.' },
        },
      },
    },
  },
] as const

export function toolEvent(
  name: string,
  args: Record<string, unknown>,
): StoryEvent | undefined {
  switch (name) {
    case 'Image':
      return imageEvent(args)
    case 'Dialogue':
      return dialogueEvent(args)
    case 'Video':
      return videoEvent(args)
    case 'Card':
      return cardEvent(args)
    case 'Delete':
      return deleteEvent(args)
    default:
      return undefined
  }
}

function imageEvent(args: Record<string, unknown>): ImageEvent {
  const name = string(args.name)
  const prompt = args.prompt === undefined ? undefined : normalizeRecord(args.prompt)
  const references = names(args.references)
  const event: ImageEvent = {
    type: 'image',
    name: name || 'Image',
    ...(prompt && Object.keys(prompt).length > 0 ? { prompt } : {}),
    ...(references.length > 0 ? { references } : {}),
    ...placement(args),
  }
  if (!name) event.error = 'name is required'
  else if (!event.prompt) event.error = `No prompt for image "${name}"`
  return event
}

function dialogueEvent(args: Record<string, unknown>): DialogueEvent {
  const speaker = string(args.speaker)
  const caption = string(args.caption)
  return {
    type: 'dialogue',
    background: string(args.background),
    ...(speaker ? { speaker } : {}),
    ...(caption ? { caption } : {}),
    ...placement(args),
  }
}

function videoEvent(args: Record<string, unknown>): VideoEvent {
  const name = string(args.name)
  const prompt = args.prompt === undefined ? undefined : normalizeRecord(args.prompt)
  const firstFrame = string(args.firstFrame)
  const lastFrame = string(args.lastFrame)
  const duration = number(args.duration)
  const event: VideoEvent = {
    type: 'video',
    name: name || 'Video',
    ...(prompt && Object.keys(prompt).length > 0 ? { prompt } : {}),
    ...(firstFrame ? { firstFrame } : {}),
    ...(lastFrame ? { lastFrame } : {}),
    ...(duration ? { duration } : {}),
    ...placement(args),
  }
  if (!name) event.error = 'name is required'
  else if (!event.prompt && !event.firstFrame)
    event.error = `No prompt for video "${name}"`
  return event
}

function cardEvent(args: Record<string, unknown>): CardEvent {
  const name = string(args.name)
  const attributes =
    args.attributes === undefined ? undefined : normalizeRecord(args.attributes)
  const event: CardEvent = {
    type: 'card',
    name: name || 'Card',
    ...cardLinks(args),
    ...(attributes ? { attributes } : {}),
  }
  if (!name) event.error = 'name is required'
  return event
}

function deleteEvent(args: Record<string, unknown>): DeleteEvent {
  const indices = Array.isArray(args.indices)
    ? args.indices.filter((index): index is number => typeof index === 'number')
    : typeof args.indices === 'number'
      ? [args.indices]
      : typeof args.index === 'number'
        ? [args.index]
        : []
  return { type: 'delete', indices }
}

export function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw)
    return isPlainObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function placement(args: Record<string, unknown>): { index?: number; replace?: boolean } {
  const index = number(args.index)
  return {
    ...(index !== undefined ? { index } : {}),
    ...(args.replace === true ? { replace: true } : {}),
  }
}

export function readRange(args: Record<string, unknown>): {
  offset?: number
  limit?: number
  last?: number
} {
  return {
    offset: number(args.offset),
    limit: number(args.limit),
    last: number(args.last),
  }
}

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

function names(value: unknown): string[] {
  const list =
    typeof value === 'string'
      ? [value]
      : Array.isArray(value)
        ? value.map((item) => String(item))
        : []
  return list
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5)
}
