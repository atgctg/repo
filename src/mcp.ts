import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { stringify } from 'yaml'
import { z } from 'zod'
import { addDialogue, mutateSlide, setCard, setImage } from './stories'

const FreeformObject = z.looseObject({}).meta({ additionalProperties: true })

const SlideSchema = z.object({
  background: z.string().optional().describe(
    'Background image name. Should depict the speaker or fit the scene.'
  ),
  speaker: z.string().optional().describe(
    'Speaker character name or role'
  ),
  dialogue: z.string().optional().describe(
    'Spoken line or action. Prefer short speech over narration.'
  ),
})

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'studio',
    version: '1.0.0',
  })

  server.registerTool(
    'Image',
    {
      description:
        'Set the current slide background by image name. Reuse an existing image name when it still fits. '
        + 'If prompt is new, it is stored as structured attributes and generated when the file is missing. '
        + 'Prompts must be self-contained: the generator only sees this prompt plus the Style card (appended after). '
        + 'Restate visual continuity every time. Give each entity distinct repeatable features. '
        + 'Never write as before, earlier, same as last, previous, this image, or that background. '
        + 'Put rendered text in quotation marks, e.g. clouds spelling "Hello". '
        + 'Background should show the speaker or the scene.',
      inputSchema: z.object({
        storyId: z.string().describe('ID of the story'),
        name: z.string().describe(
          'Image name. Reuse an existing name to keep the same background without regenerating.'
        ),
        prompt: FreeformObject.optional().describe(
          'Self-contained structured prompt (Shot, Scene, Characters, Action, Expression). '
          + 'Repeat wardrobe, hair, and faces in full. Max 3 nested levels.',
        ),
      }),
    },
    async ({ storyId, name, prompt }) => {
      const { index, story } = await setImage(storyId, { name, prompt })
      return {
        content: [
          {
            type: 'text',
            text: `[${index}] ${name} (${story.slides.length})`,
          },
        ],
      }
    },
  )

  server.registerTool(
    'Dialogue',
    {
      description:
        'Append spoken lines as new slides under the current background. '
        + 'Default to short lines, max 70 characters; split longer speech at pauses into multiple lines. '
        + 'Prefer character speech over narration. Keep the speaker\'s voice. '
        + 'Plain-text math, not LaTeX. Avoid spelling errors unless they belong to the character.',
      inputSchema: z.object({
        storyId: z.string().describe('ID of the story'),
        speaker: z.string().describe('Speaker character name or role'),
        text: z
          .union([z.string(), z.array(z.string())])
          .describe(
            'One line, or several lines that become consecutive slides. '
            + 'Each line ideally well under 70 characters.'
          ),
      }),
    },
    async ({ storyId, speaker, text }) => {
      const { indices, story } = await addDialogue(storyId, { speaker, text })
      const range = indices.length === 1
        ? `[${indices[0]}]`
        : `[${indices[0]}-${indices[indices.length - 1]}]`
      return {
        content: [
          {
            type: 'text',
            text: `${range} ${speaker} (${story.slides.length})`,
          },
        ],
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
        + 'null clears it. Default to short key-value pairs. Max 3 nested levels. '
        + 'Returns the saved card.',
      inputSchema: z.object({
        storyId: z.string().describe('ID of the story'),
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
      const story = await setCard(storyId, { name, cover, attributes })
      const card = story.cards.find((item) => item.name.toLowerCase() === name.toLowerCase())
      return {
        content: [
          {
            type: 'text',
            text: stringify(
              {
                name: card?.name ?? name,
                cover: card?.cover ?? null,
                attributes: card?.attributes ?? {},
              },
              { indent: 2 },
            ).trim(),
          },
        ],
      }
    },
  )

  const SlideQuerySchema = z.object({
    index: z
      .union([z.number().int(), z.array(z.number().int())])
      .optional()
      .describe(
        '0-based index or array of indices (negative counts from end)'
      ),
    dialogue: z.string().optional().describe(
      'Substring match in slide dialogue'
    ),
    speaker: z.string().optional().describe(
      'Exact match on slide speaker'
    ),
  })

  const storyId = z.string().describe('ID of the story')

  server.registerTool(
    'Slide',
    {
      description:
        'Get, edit, insert, or delete vertical fullscreen slides. '
        + 'Prefer query.index from a prior get. get with no query lists every slide as { index, ...fields }. '
        + 'insert_* needs exactly one target (index: -1 + insert_after appends). edit/delete can target many. '
        + 'Background should depict the speaker or scene. Returns numbered slides.',
      inputSchema: z.discriminatedUnion('op', [
        z.object({
          storyId,
          op: z.literal('get'),
          query: SlideQuerySchema.optional().describe(
            'Optional finder; omit to list all slides'
          ),
        }),
        z.object({
          storyId,
          op: z.literal('delete'),
          query: SlideQuerySchema.describe('Slides to delete'),
        }),
        z.object({
          storyId,
          op: z.literal('edit'),
          query: SlideQuerySchema.describe('Slides to patch'),
          slide: SlideSchema.describe('Fields to merge onto each matched slide'),
        }),
        z.object({
          storyId,
          op: z.literal('insert_before'),
          query: SlideQuerySchema.describe('Exactly one target slide'),
          slide: SlideSchema.describe('Slide to insert'),
        }),
        z.object({
          storyId,
          op: z.literal('insert_after'),
          query: SlideQuerySchema.describe('Exactly one target slide'),
          slide: SlideSchema.describe('Slide to insert'),
        }),
      ]),
    },
    async (args) => {
      const result = await mutateSlide(args.storyId, args)
      if (!result.ok) {
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

  return server
}

void serveStdio(createServer)
console.error(
  'studio MCP server running on stdio'
)
