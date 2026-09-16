import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { stringify } from 'yaml'
import { z } from 'zod'
import { appendSlide, createImage, mutateScript, setCard } from './stories'

const FreeformObject = z.looseObject({}).meta({ additionalProperties: true })

const SlideSchema = z.object({
  background: z.string().optional().describe(
    'Background image name. Depicts the speaker or fits the scene.'
  ),
  speaker: z.string().optional().describe(
    'Speaker character name or role'
  ),
  dialogue: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      'Spoken line or action. Can be a single string or an array of lines.'
    ),
})

const storyId = z.string().describe('ID of the story')

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'studio',
    version: '1.0.0',
  })

  server.registerTool(
    'CreateImage',
    {
      description: 'Generate an background image for the story. To overwrite an existing image, use the same name.'
       + 'Prompts must be self-contained: the generator only sees this prompt plus the Style card (appended after). '
      + 'Give each entity distinct repeatable features. '
      + 'Never write "as before", "earlier", "same as last", "previous", or "that background". '
      + 'Put rendered text in quotation marks, e.g. clouds spelling "Hello". ',
      inputSchema: z.object({
        storyId,
        name: z.string().describe('Unique name'),
        prompt: FreeformObject.describe(
          'Structured prompt object. Max 3 nested levels.',
        ),
      }),
    },
    async ({ storyId, name, prompt }) => {
      await createImage(storyId, { name, prompt })
      return {
        content: [
          {
            type: 'text',
            text: `"${name}" generated`,
          },
        ],
      }
    },
  )

  server.registerTool(
    'Slide',
    {
      description:
        'Append one or more slides to the story. '
        + 'Specify background image, speaker, and dialogue line(s). '
        + 'If dialogue is an array of strings, lines are stacked on the slide. '
        + 'Default to short lines, max 70 characters; split longer speech at pauses into multiple lines. '
        + 'Prefer character speech over narration. Keep the speaker\'s voice. '
        + 'Can also append slides without dialogue (establishing shots or pauses).',
      inputSchema: z.object({
        storyId,
        background: z.string().optional().describe(
          'Background image name from media'
        ),
        speaker: z.string().optional().describe(
          'Speaker character name or role'
        ),
        dialogue: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'One line or array of lines. '
            + 'Each line ideally well under 70 characters.'
          ),
        slides: z
          .array(SlideSchema)
          .optional()
          .describe('Explicit array of slides to append'),
      }),
    },
    async ({ storyId, background, speaker, dialogue, slides }) => {
      const { indices, story } = await appendSlide(storyId, { background, speaker, dialogue, slides })
      const range = indices.length === 0
        ? '[]'
        : indices.length === 1
          ? `[${indices[0]}]`
          : `[${indices[0]}-${indices[indices.length - 1]}]`
      return {
        content: [
          {
            type: 'text',
            text: `${range} (${story.slides.length} slides)`,
          },
        ],
      }
    },
  )

  server.registerTool(
    'Script',
    {
      description:
        'Read, replace, insert, or delete slides in the story script. '
        + 'read returns numbered slides with their 0-based indices. '
        + 'replace updates the slide at index. '
        + 'insert places a new slide before index (-1 appends). '
        + 'delete removes slides by index.',
      inputSchema: z.discriminatedUnion('op', [
        z.object({
          storyId,
          op: z.literal('read'),
          last: z.number().int().positive().optional().describe(
            'Number of recent slides to return from the end'
          ),
          offset: z.number().int().optional().describe(
            'Start index (0-based, negative counts from end)'
          ),
          limit: z.number().int().positive().optional().describe(
            'Number of slides to return'
          ),
        }),
        z.object({
          storyId,
          op: z.literal('replace'),
          index: z.number().int().describe(
            '0-based index of the slide to replace (negative counts from end)'
          ),
          slide: SlideSchema.describe('New slide fields'),
        }),
        z.object({
          storyId,
          op: z.literal('insert'),
          index: z.number().int().describe(
            '0-based index before which to insert (negative counts from end)'
          ),
          slide: SlideSchema.describe('Slide to insert'),
        }),
        z.object({
          storyId,
          op: z.literal('delete'),
          indices: z
            .union([z.number().int(), z.array(z.number().int())])
            .describe('0-based index or array of indices to delete'),
        }),
      ]),
    },
    async (args) => {
      const result = await mutateScript(args.storyId, args)
      if ('error' in result) {
        return {
          isError: true,
          content: [{ type: 'text', text: result.error }],
        }
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result.slides, null, 2) }],
      }
    },
  )

  server.registerTool(
    'Card',
    {
      description:
        'Create or patch a named card (characters, Style, etc.). Only create cards when asked. '
        + 'attributes is a patch merged into the existing card with this name: nested objects deep-merge, '
        + 'dotted keys set a path (Look.Wear), JSON null deletes a field. cover names an existing image; '
        + 'null clears it. Default to short key-value pairs. Max 3 nested levels. ',
      inputSchema: z.object({
        storyId,
        name: z.string().describe(
          'Card name. Same name patches the existing card.'
        ),
        cover: z
          .string()
          .nullable()
          .optional()
          .describe(
            'Existing image name to use as the card cover. null clears it.'
          ),
        attributes: FreeformObject.optional().describe(
          'Patch of short keys/values. Nested merge, dotted paths, null deletes. '
          + 'Example: { "Look.Wear": "pink cardigan", Vibe: null }'
        ),
      }),
    },
    async ({ storyId, name, cover, attributes }) => {
      await setCard(storyId, { name, cover, attributes })
      return {
        content: [
          {
            type: 'text',
            text: `${name} updated`,
          },
        ],
      }
    },
  )

  return server
}

void serveStdio(createServer)
console.error('studio MCP server running on stdio')
