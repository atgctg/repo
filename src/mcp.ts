import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { stringify } from 'yaml'
import { z } from 'zod'
import { errorMessage, VOICE_NAMES } from './generate'
import { normalizeRecord } from './records'
import { deleteScenes, insertScene, readScenes, setCard } from './stories'
import { InsertImageSceneSchema, InsertVideoSceneSchema, type NumberedScene } from './types'

const storyId = z.string().describe('ID of the story')
const insertIndex = z.number().int().nonnegative().optional()
  .describe('0-based index before which to insert (omit to append at the end)')

function plainText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  return stringify(value, { indent: 2 }).trim()
}

function formatScene(scene: NumberedScene): string {
  const head = `[${scene.index}] ${scene.type} ${scene.name}`
  switch (scene.type) {
    case 'image': {
      const body = [scene.speaker && `${scene.speaker}:`, scene.caption].filter(Boolean).join('\n')
      return body ? `${head}\n${body}` : head
    }
    case 'video': {
      const body = plainText(scene.prompt)
      return body ? `${head}\n${body}` : head
    }
    default: {
      const _exhaustive: never = scene
      return _exhaustive
    }
  }
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'studio',
    version: '1.0.0',
  })

  server.registerTool(
    'Insert',
    {
      description: 'Insert a scene. Set prompt to generate a new asset; omit prompt to reuse an existing name.',
      inputSchema: z.discriminatedUnion('type', [
        InsertImageSceneSchema.extend({ storyId, index: insertIndex }),
        InsertVideoSceneSchema.extend({ storyId, index: insertIndex }),
      ]),
    },
    async (params) => {
      try {
        const { storyId: id, index, ...scene } = params
        const { index: idx, story } = await insertScene(id, scene, index)
        return { content: [{ type: 'text', text: `[${idx}] (${story.scenes.length} scenes)` }] }
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: errorMessage(error) }] }
      }
    },
  )

  server.registerTool(
    'Read',
    {
      description: 'Read scenes',
      inputSchema: z.object({
        storyId,
        offset: z.number().int().optional().describe('Start index (0-based, negative counts from end)'),
        limit: z.number().int().positive().optional().describe('Number of scenes to return'),
        last: z.number().int().positive().optional().describe('Number of recent scenes to return from the end'),
      }),
    },
    async ({ storyId, offset, limit, last }) => {
      const scenes = await readScenes(storyId, { offset, limit, last })
      return { content: [{ type: 'text', text: scenes.map(formatScene).join('\n\n') }] }
    },
  )

  server.registerTool(
    'Delete',
    {
      description: 'Delete scenes',
      inputSchema: z.object({
        storyId,
        indices: z.union([z.number().int(), z.array(z.number().int())]).optional()
          .describe('0-based index or array of indices to delete (negative counts from end)'),
        index: z.number().int().optional().describe('Alias for indices (single 0-based index)'),
      }),
    },
    async ({ storyId, indices, index }) => {
      try {
        const { deleted, story } = await deleteScenes(storyId, indices ?? index ?? [])
        return { content: [{ type: 'text', text: `Deleted [${deleted.join(', ')}] (${story.scenes.length} scenes)` }] }
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: errorMessage(error) }] }
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
        cover: z.string().nullable().optional()
          .describe('Existing image asset name to use as card cover, or null to clear it. Prefer a cover whose name matches the card name.'),
        attributes: z.preprocess(
          (val) => (val === undefined ? undefined : normalizeRecord(val)),
          z.object({
            Voice: z.enum(VOICE_NAMES).nullable().optional().describe('Voice name for auto speech on image captions'),
          }).catchall(z.unknown()).optional().describe(
            'Deep-merged key-value patch (any JSON values, including arrays and numbers). Set a field to null to delete it.',
          ),
        ),
      }),
    },
    async ({ storyId, name, cover, attributes }) => {
      await setCard(storyId, { name, cover, attributes })
      return { content: [{ type: 'text', text: `${name} updated` }] }
    },
  )

  return server
}

void serveStdio(createServer)
console.error('studio MCP server running on stdio')
