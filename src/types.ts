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
  dialogue?: string | string[]
}

export type Story = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  slides: Slide[]
  media: MediaAsset[]
  cards: Card[]
}

export type StorySummary = {
  id: string
  title: string
  cover?: string
}
