import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'
import { errorMessage } from './generate'
import { normalizeRecord } from './records'
import {
  deleteSlides,
  generateImage,
  insertSlide,
  readSlides,
  setCard,
} from './stories'

function normalizeToRecord(val: unknown) {
  return val === undefined ? undefined : normalizeRecord(val)
}

const SlideSchema = z.object({
  background: z.string().optional().describe('Background image name from media'),
  speaker: z.string().optional().describe('Speaker character name or role'),
  dialogue: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Spoken line or short *action* in asterisks. Try to keep lines below 70 chars, splitting longer speech into multiple lines.'),
})

const MAX_PROMPT_CHARS = 2000
const PromptLeaf = z.string().describe('Concise description text')
const PromptDetails = z
  .record(z.string(), PromptLeaf)
  .describe('Named group of text fields, e.g. Characters: { Leo: "..." }')
const PromptGroup = z.record(z.string(), z.union([PromptLeaf, PromptDetails]))
const PromptSection = z.union([PromptLeaf, z.record(z.string(), z.union([PromptLeaf, PromptGroup]))])

const PromptSchema = z.preprocess(
  normalizeToRecord,
  z
    .record(z.string(), PromptSection)
    .refine(
      (val) => JSON.stringify(val).length <= MAX_PROMPT_CHARS,
      { message: `Prompt object must be ${MAX_PROMPT_CHARS} characters or less when serialized` },
    )
    .describe(`Structured freeform key-value object (max 3 nested levels, max ${MAX_PROMPT_CHARS} chars serialized). Values are text or nested objects of text.`),
)

const storyId = z.string().describe('ID of the story')

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'studio',
    version: '1.0.0',
  })

  server.registerTool(
    'Imagine',
    {
      description: 'Generate an image',
      inputSchema: z.object({
        storyId,
        name: z.string().describe('Unique (use an existing name to overwrite)'),
        prompt: PromptSchema,
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
      description: 'Insert a slide',
      inputSchema: SlideSchema.extend({
        storyId,
        index: z.number().int().nonnegative().optional().describe(
          '0-based index before which to insert (omit to append at the end)'
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
      description: 'Delete slides',
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
      const targets = indices ?? index ?? []
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
          .describe('Existing image name to use as card cover, or null to clear it'),
        attributes: z.preprocess(
          normalizeToRecord,
          z
            .record(z.string(), z.unknown())
            .optional()
            .describe(
              'Deep-merged key-value patch (any JSON values, including arrays and numbers). Set a field to null to delete it.',
            ),
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
