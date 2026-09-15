import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'
import { addDialogue, mutateSlide, setCard, setImage } from './stories'

const FreeformObject = z.looseObject({}).meta({ additionalProperties: true })

const SlideSchema = z.object({
  background: z.string().optional().describe('Background image name'),
  speaker: z.string().optional().describe('Speaker character name or role'),
  dialogue: z.string().optional().describe('Spoken dialogue or narration'),
})

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'studio',
    version: '1.0.0',
  })

  server.registerTool(
    'Image',
    {
      description: 'Set background image, optionally register a prompt, and generate an image when missing',
      inputSchema: z.object({
        storyId: z.string().describe('ID of the story'),
        name: z.string().describe('Name of the image'),
        prompt: FreeformObject.optional().describe('Optional structured prompt object'),
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
      description: 'Add dialogue to story slide(s)',
      inputSchema: z.object({
        storyId: z.string().describe('ID of the story'),
        speaker: z.string().describe('Speaker character name or role'),
        text: z.union([z.string(), z.array(z.string())]).describe('Spoken dialogue (single string or array of lines)'),
      }),
    },
    async ({ storyId, speaker, text }) => {
      const { indices, story } = await addDialogue(storyId, { speaker, text })
      const range = indices.length === 1 ? `[${indices[0]}]` : `[${indices[0]}-${indices[indices.length - 1]}]`
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
      description: 'Create or update a card in the story (characters, Style, etc.)',
      inputSchema: z.object({
        storyId: z.string().describe('ID of the story'),
        name: z.string().describe('Card name (e.g. "Style", "Dennis Ritchie")'),
        cover: z.string().optional().describe('Cover media reference name'),
        attributes: FreeformObject.describe('Structured card attributes/info payload'),
      }),
    },
    async ({ storyId, name, cover, attributes }) => {
      await setCard(storyId, { name, cover, attributes })
      return {
        content: [
          {
            type: 'text',
            text: `card:${name} saved`,
          },
        ],
      }
    },
  )

  const SlideQuerySchema = z.object({
    index: z
      .union([z.number().int(), z.array(z.number().int())])
      .optional()
      .describe('0-based index or array of indices (negative counts from end)'),
    dialogue: z.string().optional().describe('Substring match in slide dialogue'),
    speaker: z.string().optional().describe('Exact match on slide speaker'),
  })

  const storyId = z.string().describe('ID of the story')

  server.registerTool(
    'Slide',
    {
      description:
        'Get, edit, insert, or delete slides. Prefer query.index from a prior get. get with no query lists every slide as { index, ...fields }. insert_* requires exactly one target (use index: -1 + insert_after to append). edit/delete can target many. Returns numbered slides.',
      inputSchema: z.discriminatedUnion('op', [
        z.object({
          storyId,
          op: z.literal('get'),
          query: SlideQuerySchema.optional().describe('Optional finder; omit to list all slides'),
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
console.error('studio MCP server running on stdio')
