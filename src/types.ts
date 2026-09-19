import { z } from 'zod'
import { normalizeRecord } from './records'

const AssetBase = z.object({
  name: z.string(),
  createdAt: z.string(),
  url: z.string().optional(),
})

export const ImageAssetSchema = AssetBase.extend({
  kind: z.literal('image'),
  prompt: z.record(z.string(), z.unknown()).optional(),
  references: z.array(z.string()).optional(),
})

export const VideoAssetSchema = AssetBase.extend({
  kind: z.literal('video'),
  prompt: z.string().optional(),
  firstFrame: z.string().optional(),
  lastFrame: z.string().optional(),
  duration: z.number().int().min(5).max(15).optional(),
})

export const AssetSchema = z.discriminatedUnion('kind', [
  ImageAssetSchema,
  VideoAssetSchema,
])

export type ImageAsset = z.infer<typeof ImageAssetSchema>
export type VideoAsset = z.infer<typeof VideoAssetSchema>
export type Asset = z.infer<typeof AssetSchema>
export type AssetKind = Asset['kind']

export type Card = {
  name: string
  cover?: string
  attributes?: Record<string, unknown>
}

const MAX_PROMPT_CHARS = 2000
const PromptLeaf = z.string().describe('Concise description text')
const PromptDetails = z.record(z.string(), PromptLeaf).describe('Named group of text fields, e.g. Characters: { Leo: "..." }')
const PromptGroup = z.record(z.string(), z.union([PromptLeaf, PromptDetails]))
const PromptSection = z.union([PromptLeaf, z.record(z.string(), z.union([PromptLeaf, PromptGroup]))])
export const PromptSchema = z.preprocess(
  (val) => (val === undefined ? undefined : normalizeRecord(val)),
  z.record(z.string(), PromptSection)
    .refine((val) => JSON.stringify(val).length <= MAX_PROMPT_CHARS, {
      message: `Prompt object must be ${MAX_PROMPT_CHARS} characters or less when serialized`,
    })
    .describe(`Structured freeform key-value object (max 3 nested levels, max ${MAX_PROMPT_CHARS} chars serialized). Values are text or nested objects of text.`),
)

const SceneName = z.string().describe('Unique (use an existing name to overwrite)')
const AssetNames = z.union([z.string(), z.array(z.string())]).transform((value) =>
  (Array.isArray(value) ? value : [value]).map((s) => s.trim()).filter(Boolean),
)

export const SpeechSchema = z.object({
  key: z.string(),
  words: z.array(z.string()).optional(),
  t: z.array(z.number().int().nonnegative()).optional(),
})

export const ImageSceneSchema = z.object({
  type: z.literal('image'),
  name: z.string(),
  speaker: z.string().optional().describe('Speaker character name or role'),
  caption: z.string().optional()
    .describe('Dialogue lines, each below 70 chars. Split longer speech at natural pauses into multiple lines. Each action should be a separate line starting and ending with an *asterisk*. If speaker has a Card Voice, speech is generated automatically. Never surround lines with quotation marks. Use plain text for math instead of LaTeX (e.g. 2^3 = 8).'),
  speech: SpeechSchema.optional(),
})

export const VideoSceneSchema = z.object({
  type: z.literal('video'),
  name: z.string(),
})

export const SceneSchema = z.discriminatedUnion('type', [ImageSceneSchema, VideoSceneSchema])

export const InsertImageSceneSchema = ImageSceneSchema.omit({ speech: true }).extend({
  name: SceneName,
  prompt: PromptSchema.optional(),
  references: AssetNames.optional()
    .describe('Existing image asset names to edit from (1-5). Uses p-image-edit when set.'),
})

export const InsertVideoSceneSchema = VideoSceneSchema.extend({
  name: SceneName,
  prompt: z.string().optional().describe('Detailed second by second description of what happens in the video. Include spoken lines in quotes. Explicitly enable or disable any diagetic or non-diagetic audio.'),
  firstFrame: z.string().optional().describe('Image asset name used for the first frame'),
  lastFrame: z.string().optional().describe('Image asset name used for the last frame'),
  duration: z.number().int().min(5).max(15).default(5).describe('Seconds 5 to 15'),
})

export const InsertSceneSchema = z.discriminatedUnion('type', [
  InsertImageSceneSchema,
  InsertVideoSceneSchema,
])

export type Speech = z.infer<typeof SpeechSchema>
export type ImageScene = z.infer<typeof ImageSceneSchema>
export type VideoScene = z.infer<typeof VideoSceneSchema>
export type Scene = z.infer<typeof SceneSchema>
export type InsertImageScene = z.infer<typeof InsertImageSceneSchema>
export type InsertVideoScene = z.infer<typeof InsertVideoSceneSchema>
export type InsertScene = z.infer<typeof InsertSceneSchema>

export type NumberedScene = Scene & {
  index: number
  prompt?: string
}

export type Story = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  scenes: Scene[]
  assets: Asset[]
  cards: Card[]
}

export type World = {
  id: string
  title: string
  cover?: string
}
