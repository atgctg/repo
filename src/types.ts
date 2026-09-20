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
  references: z.array(z.string()).max(5).optional(),
})

export const VideoAssetSchema = AssetBase.extend({
  kind: z.literal('video'),
  prompt: z.record(z.string(), z.unknown()).optional(),
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
export const PromptSchema = z.preprocess(
  (val) => (val === undefined ? undefined : normalizeRecord(val)),
  z.record(z.string(), z.unknown()).refine(
    (val) => JSON.stringify(val).length <= MAX_PROMPT_CHARS,
    { message: `Prompt object must be ${MAX_PROMPT_CHARS} characters or less when serialized` },
  ),
)

const AssetNames = z.union([z.string(), z.array(z.string()).max(5)]).transform((value) =>
  (Array.isArray(value) ? value : [value]).map((s) => s.trim()).filter(Boolean),
).pipe(z.array(z.string()).max(5))

export const SpeechSchema = z.object({
  key: z.string(),
  words: z.array(z.string()).optional(),
  t: z.array(z.number().int().nonnegative()).optional(),
})

export const ImageSceneSchema = z.object({
  type: z.literal('image'),
  name: z.string(),
})

export const DialogueSceneSchema = z.object({
  type: z.literal('dialogue'),
  background: z.string(),
  speaker: z.string().optional(),
  caption: z.string().optional(),
  speech: SpeechSchema.optional(),
})

export const VideoSceneSchema = z.object({
  type: z.literal('video'),
  name: z.string(),
})

export const SceneSchema = z.discriminatedUnion('type', [
  ImageSceneSchema,
  DialogueSceneSchema,
  VideoSceneSchema,
])

export const InsertImageSceneSchema = ImageSceneSchema.omit({ type: true }).extend({
  prompt: PromptSchema.optional(),
  references: AssetNames.optional(),
})

export const InsertDialogueSceneSchema = DialogueSceneSchema.omit({ type: true, speech: true })

export const InsertVideoSceneSchema = VideoSceneSchema.omit({ type: true }).extend({
  prompt: PromptSchema.optional(),
  firstFrame: z.string().optional(),
  lastFrame: z.string().optional(),
  duration: z.number().int().min(5).max(15).default(5),
})

export type Speech = z.infer<typeof SpeechSchema>
export type ImageScene = z.infer<typeof ImageSceneSchema>
export type DialogueScene = z.infer<typeof DialogueSceneSchema>
export type VideoScene = z.infer<typeof VideoSceneSchema>
export type Scene = z.infer<typeof SceneSchema>
export type InsertImageScene = z.infer<typeof InsertImageSceneSchema>
export type InsertDialogueScene = z.infer<typeof InsertDialogueSceneSchema>
export type InsertVideoScene = z.infer<typeof InsertVideoSceneSchema>

export type NumberedScene = Scene & {
  index: number
  prompt?: Record<string, unknown>
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
