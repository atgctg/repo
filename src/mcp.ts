import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { stringify } from 'yaml'
import { z } from 'zod'
import { errorMessage, VOICE_NAMES } from './generate'
import { normalizeRecord } from './records'
import { deleteScenes, insertDialogue, insertImage, insertVideo, readScenes, setCard } from './stories'
import {
  InsertDialogueSceneSchema,
  InsertImageSceneSchema,
  InsertVideoSceneSchema,
  PromptSchema,
  type NumberedScene,
} from './types'

const storyId = z.string().describe('ID of the story')
const insertIndex = z.number().int().nonnegative().optional()
  .describe('0-based index before which to insert (omit to append at the end)')
const sceneName = z.string().describe('Asset name (use an existing name to overwrite or reuse)')

function formatScene(scene: NumberedScene): string {
  switch (scene.type) {
    case 'image':
      return `[${scene.index}] image ${scene.name}`
    case 'dialogue': {
      const head = `[${scene.index}] dialogue ${scene.background}`
      const body = [scene.speaker && `${scene.speaker}:`, scene.caption].filter(Boolean).join('\n')
      return body ? `${head}\n${body}` : head
    }
    case 'video': {
      const head = `[${scene.index}] video ${scene.name}`
      const body = scene.prompt ? stringify(scene.prompt, { indent: 2 }).trim() : ''
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
    'Dialogue',
    {
      description: 'Add dialogue on top an existing image',
      inputSchema: InsertDialogueSceneSchema.extend({
        storyId,
        index: insertIndex,
        background: z.string().describe('Existing image name to show behind the caption'),
        speaker: z.string().optional().describe('Speaker character name or role'),
        caption: z.string().optional().describe(
          'Dialogue lines, each below 70 chars. Split longer speech at natural pauses into multiple lines. Each action should be a separate line starting and ending with an *asterisk*. If speaker has a Card Voice, speech is generated automatically. Never surround lines with quotation marks. Use plain text for math instead of LaTeX (e.g. 2^3 = 8).',
        ),
      }),
    },
    async (params) => {
      try {
        const { storyId: id, index, ...scene } = params
        const { index: idx } = await insertDialogue(id, scene, index)
        return { content: [{ type: 'text', text: `[${idx}]` }] }
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: errorMessage(error) }] }
      }
    },
  )
  
  server.registerTool(
    'Image',
    {
      description: 'Generate an image',
      inputSchema: InsertImageSceneSchema.extend({
        storyId,
        index: insertIndex,
        name: sceneName,
        prompt: PromptSchema.optional().describe(
          'Structured JSON prompt. Suggested fields: Subject (who/what; age, appearance, clothing, expression), Behavior (action; screen-left/screen-right; who they face; front view vs rear/OTS; Edit: modification, target, preservation).',
        ),
        references: InsertImageSceneSchema.shape.references.describe(
          'Existing image names to edit from (max 5)',
        ),
      }),
    },
    async (params) => {
      try {
        const { storyId: id, index, ...scene } = params
        const { index: idx } = await insertImage(id, scene, index)
        return { content: [{ type: 'text', text: `[${idx}]` }] }
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: errorMessage(error) }] }
      }
    },
  )


  server.registerTool(
    'Video',
    {
      description: 'IF_ASKED Generate a video. Can take up to a few minutes, so returns immediately while video generates in the background.',
      inputSchema: InsertVideoSceneSchema.extend({
        storyId,
        index: insertIndex,
        name: sceneName,
        prompt: PromptSchema.optional().describe(
          'Structured JSON prompt. Suggested fields: Subject (who/what; appearance, clothing, distinguishing features), Actions array (what happens second by second; spoken lines in quotation marks), Camera (position, angle, focus, motion), Audio (diegetic and non-diegetic; explicitly enable or disable music, room tone, and speech).',
        ),
        firstFrame: z.string().optional().describe('Image name used for the first frame'),
        lastFrame: z.string().optional().describe('Image name used for the last frame'),
        duration: z.number().int().min(5).max(15).default(5).describe('Seconds 5 to 15'),
      }),
    },
    async (params) => {
      try {
        const { storyId: id, index, ...scene } = params
        const { index: idx } = await insertVideo(id, scene, index)
        return { content: [{ type: 'text', text: `[${idx}] Generating video...` }] }
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
        return { content: [{ type: 'text', text: `Deleted [${deleted.join(', ')}] (${story.scenes.length} scenes remaining)` }] }
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: errorMessage(error) }] }
      }
    },
  )

  server.registerTool(
    'Card',
    {
      description: 'IF_ASKED Create or patch a named card (Character, Style, etc.).',
      inputSchema: z.object({
        storyId,
        name: z.string().describe('Unique'),
        cover: z.string().nullable().optional()
          .describe('Existing image asset name to use as card cover, or null to clear it. Prefer a cover whose name matches the card name.'),
        voice: z.enum(VOICE_NAMES).nullable().optional()
          .describe('IF_ASKED Voice for auto speech on dialogue captions.'),
        attributes: z.preprocess(
          (val) => (val === undefined ? undefined : normalizeRecord(val)),
          z.record(z.string(), z.unknown()),
        ).optional().describe(
          'Deep-merged key-value patch. Set a field to null to delete it. Suggested fields: Info { Age, Gender , ... } Appearance { Clothing, Hair, ... } Relationships { ... } Personality { Goals, ... }',
        ),
      }),
    },
    async ({ storyId, name, cover, voice, attributes }) => {
      await setCard(storyId, { name, cover, voice, attributes })
      return { content: [{ type: 'text', text: `${name} updated` }] }
    },
  )

  return server
}

void serveStdio(createServer)
console.error('studio MCP server running on stdio')
