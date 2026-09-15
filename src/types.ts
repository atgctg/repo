export type MediaAsset = {
  type: 'image' | 'audio' | 'video'
  name: string
  key?: string
  prompt?: Record<string, unknown>
  createdAt: string
}

export type Card = {
  name: string
  cover?: string
  attributes?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type Slide = {
  background?: string
  speaker?: string
  dialogue?: string
}

export type StoryMeta = {
  id: string
  createdAt: string
  updatedAt: string
}

export type Story = {
  meta: StoryMeta
  slides: Slide[]
  media: MediaAsset[]
  cards: Card[]
}
