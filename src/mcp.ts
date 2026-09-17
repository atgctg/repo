import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'
import { errorMessage } from './generate'
import {
  deleteSlides,
  generateImage,
  insertSlide,
  readSlides,
  setCard,
} from './stories'

const FreeformObject = z.looseObject({}).meta({ additionalProperties: true })

const SlideSchema = z.object({
  background: z.string().optional().describe('Background image name from media'),
  speaker: z.string().optional().describe('Speaker character name or role'),
  dialogue: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Spoken line or action. Can be a single string or an array of lines.'),
})

const storyId = z.string().describe('ID of the story')

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'studio',
    version: '1.0.0',
  })

  server.registerTool(
    'Image',
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
      try {
        await generateImage(storyId, { name, prompt })
        return { content: [{ type: 'text', text: `"${name}" generated` }] }
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text', text: `"${name}" failed: ${errorMessage(error)}` }],
        }
      }
    },
  )

  server.registerTool(
    'Insert',
    {
      description:
        'Append or insert a slide into the story. '
        + 'Specify background, speaker, and dialogue line(s). '
        + 'If dialogue is an array of strings, lines are stacked on the slide. '
        + 'Default to short lines, max 70 characters; split longer speech at pauses into multiple lines. '
        + 'Prefer character speech over narration. Keep the speaker\'s voice. '
        + 'Can also add slides without dialogue (establishing shots or pauses). ',
      inputSchema: SlideSchema.extend({
        storyId,
        index: z.number().int().nonnegative().optional().describe(
          '0-based index before which to insert (omit to append to end)'
        ),
      }),
    },
    async ({ storyId, index, ...slide }) => {
      const { index: idx, story } = await insertSlide(storyId, slide, index)
      return {
        content: [
          {
            type: 'text',
            text: `[${idx}] (${story.slides.length} slides)`,
          },
        ],
      }
    },
  )

  server.registerTool(
    'Read',
    {
      description: 'Read numbered slides from the story script.',
      inputSchema: z.object({
        storyId,
        offset: z.number().int().optional().describe(
          'Start index (0-based, negative counts from end)'
        ),
        limit: z.number().int().positive().optional().describe(
          'Number of slides to return'
        ),
        last: z.number().int().positive().optional().describe(
          'Number of recent slides to return from the end'
        ),
      }),
    },
    async ({ storyId, offset, limit, last }) => {
      const slides = await readSlides(storyId, { offset, limit, last })
      return {
        content: [{ type: 'text', text: JSON.stringify(slides, null, 2) }],
      }
    },
  )

  server.registerTool(
    'Delete',
    {
      description: 'Delete slides by 0-based index or array of indices.',
      inputSchema: z.object({
        storyId,
        indices: z
          .union([z.number().int(), z.array(z.number().int())])
          .optional()
          .describe('0-based index or array of indices to delete (negative counts from end)'),
        index: z
          .number()
          .int()
          .optional()
          .describe('Alias for indices (single 0-based index)'),
      }),
    },
    async ({ storyId, indices, index }) => {
      const targets = indices ?? (index !== undefined ? index : [])
      try {
        const { deleted, story } = await deleteSlides(storyId, targets)
        return {
          content: [
            {
              type: 'text',
              text: `Deleted [${deleted.join(', ')}] (${story.slides.length} slides)`,
            },
          ],
        }
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text', text: errorMessage(error) }],
        }
      }
    },
  )

  server.registerTool(
    'Card',
    {
      description:
        'Create or patch a named card (characters, Style, etc.). Only create cards when asked. '
        + 'attributes is a patch merged into the existing card with this name: nested objects deep-merge, '
        + 'JSON null deletes a field. cover names an existing image; '
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
          'Patch of short keys/values. Nested merge, null deletes. '
          + 'Example: { Look: { Wear: "pink cardigan" }, Vibe: null }'
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
