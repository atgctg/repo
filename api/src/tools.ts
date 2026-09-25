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
              'Structured JSON prompt. Suggested fields: Subject, Behavior, Environment. Copy each character look from their card.',
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
