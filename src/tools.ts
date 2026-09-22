export const STORY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'Image',
      description:
        'Generate an image. Always create an image before dialogue when the scene cannot reuse an existing image.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Human readable asset name in sentence case. Reuse an existing name to overwrite it.',
          },
          prompt: {
            type: 'object',
            description:
              'Structured JSON prompt. Suggested fields: Subject, Behavior, Environment. Repeat appearance in every image.',
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
      description: 'IF_ASKED Create or patch a named card (Character, Style, etc.).',
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
      description: 'Delete scenes by index.',
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
