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

const SlideSchema = z.object({
  background: z.string().optional().describe('Background image name from media'),
  speaker: z.string().optional().describe('Speaker character name or role; comes before dialogue field'),
  dialogue: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Spoken line or short *action* in asterisk. Can be a single string or an array of lines. Do not surround with quotation marks.'),
})

const storyId = z.string().describe('ID of the story')

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'studio',
    version: '1.0.0',
  })

  const MAX_PROMPT_CHARS = 2500
  const SOFT_MAX_PROMPT_CHARS = 2000

  server.registerTool(
    'Imagine',
    {
      description: 'Generate an image. To overwrite an existing image, use the same name.'
      + 'Give each entity distinct repeatable features. '
      + 'Put rendered text in quotation marks, e.g. clouds spelling "Hello". '
       + 'Prompts must be self-contained: the generator only sees this prompt plus the Style card (appended after). '
       + 'Never refer to previous images using "earlier", "same as last" or similar. ',
      inputSchema: z.object({
        storyId,
        name: z.string().describe('Unique'),
        prompt: z
          .record(z.string(), z.unknown())
          .refine(
            (val) => JSON.stringify(val).length <= MAX_PROMPT_CHARS,
            { message: `Prompt object must be ${SOFT_MAX_PROMPT_CHARS} characters or less when serialized` },
          )
          .describe(`Structured prompt object. Max 3 nested levels, max ${SOFT_MAX_PROMPT_CHARS} chars JSON.`),
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
        'Insert a slide into the story. Use this to continue the story by appending new slides one by one. '
        + 'Max 70 characters per line; split longer speech at natural pauses into multiple lines. '
        + 'Leave speaker empty for narration or superimposed text.'
        + 'Prefer character dialogue over narration. '
        + 'For visual storytelling, only set the background. ',
      inputSchema: SlideSchema.extend({
        storyId,
        index: z.number().int().nonnegative().optional().describe(
          '0-based index before which to insert (omit this to just append at the end)'
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
      description: 'Create or patch a named card (Character, Style, etc.). Only create cards when asked.',
      inputSchema: z.object({
        storyId,
        name: z.string().describe('Unique'),
        cover: z
          .string()
          .nullable()
          .optional()
          .describe(
            'Existing image name to use as the card cover, or `null` to clear it.'
          ),
        attributes: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            'A patch merged into the existing card with this name: nested objects deep-merge. '
            + 'Default to short key-value pairs. Max 3 nested levels. Use `null` to delete a field.',
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
