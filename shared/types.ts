export type Attributes = Record<string, unknown>

interface StoryEventBase {
  error?: string
}

interface InsertEvent extends StoryEventBase {
  index?: number
  replace?: boolean
}

interface AssetBase {
  name: string
  prompt?: Attributes
  width?: number
  height?: number
  dominantColor?: string
  references?: string[]
}

export type ImageAsset = AssetBase & { type: 'image' }

export type VideoAsset = AssetBase & {
  type: 'video'
  firstFrame?: string
  lastFrame?: string
  duration?: number
}

export type Asset = (ImageAsset | VideoAsset) & { url?: string }

export interface InputVoice {
  audio: string
  transcript: string
}

export interface InputEvent extends StoryEventBase {
  type: 'input'
  text: string
  selected?: number[]
  pasted?: string
  voice?: InputVoice
}

export interface OutputEvent extends StoryEventBase {
  type: 'output'
  text: string
}

export interface ImageEvent extends InsertEvent, AssetBase {
  type: 'image'
}

export interface DialogueEvent extends InsertEvent {
  type: 'dialogue'
  background: string
  caption?: string
  speaker?: string
}

export interface VideoEvent extends InsertEvent, AssetBase {
  type: 'video'
  firstFrame?: string
  lastFrame?: string
  duration?: number
}

export interface CardEvent extends StoryEventBase {
  type: 'card'
  name: string
  cover?: string | null
  voice?: string | null
  attributes?: Attributes
}

export interface DeleteEvent extends StoryEventBase {
  type: 'delete'
  indices: number[]
}

export type StoryEvent =
  | InputEvent
  | OutputEvent
  | ImageEvent
  | DialogueEvent
  | VideoEvent
  | CardEvent
  | DeleteEvent

export type Card = {
  name: string
  cover?: string
  voice?: string
  attributes?: Attributes
}

export type Speech = {
  key: string
  words?: string[]
  t?: number[]
}

export type MessageScene = {
  type: 'message'
  text: string
  event: number
  background?: string
}

export type ImageScene = { type: 'image'; name: string; event: number }

export type DialogueScene = {
  type: 'dialogue'
  background: string
  event: number
  speaker?: string
  caption?: string
  speech?: Speech
}

export type VideoScene = { type: 'video'; name: string; event: number }

export type Scene = MessageScene | ImageScene | DialogueScene | VideoScene

export type Story = {
  id: string
  world: string
  title: string
  createdAt: string
  updatedAt: string
  events: StoryEvent[]
  scenes: Scene[]
  assets: Asset[]
  cards: Card[]
}

export type World = {
  id: string
  title: string
  cover?: string
}

export type WorldSource = World & {
  events: StoryEvent[]
}

export type StorySummary = {
  id: string
  world: string
  title: string
  cover?: string
  updatedAt: string
  preview: string
  case?: string
}

export type TurnPhase = 'model' | 'image' | 'video' | 'voice'
