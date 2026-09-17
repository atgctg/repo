export type MediaAsset = {
  name: string
  prompt?: Record<string, unknown>
  createdAt: string
  url?: string
}

export type Card = {
  name: string
  cover?: string
  attributes?: Record<string, unknown>
}

export type Slide = {
  background?: string
  speaker?: string
  dialogue?: string | string[]
}

export type NumberedSlide = Slide & {
  index: number
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
