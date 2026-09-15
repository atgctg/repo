import type { Slide } from './types'

export function resolveSlides(slides: Slide[]): Slide[] {
  let background: string | undefined
  let speaker: string | undefined

  return slides.map((slide) => {
    if (slide.background) background = slide.background
    if (slide.speaker) speaker = slide.speaker

    const resolved: Slide = {}
    if (background) resolved.background = background
    if (slide.dialogue) {
      resolved.dialogue = slide.dialogue
      if (speaker) resolved.speaker = speaker
    } else if (slide.speaker) {
      resolved.speaker = slide.speaker
    }
    return resolved
  })
}

export function sparsifySlides(slides: Slide[]): Slide[] {
  let lastBackground: string | undefined
  let lastSpeaker: string | undefined

  return slides.map((slide) => {
    const sparse: Slide = {}
    const hasDialogue = Boolean(slide.dialogue?.trim())

    if (slide.background) {
      if (slide.background !== lastBackground || !hasDialogue) {
        sparse.background = slide.background
      }
      lastBackground = slide.background
    }

    if (slide.speaker) {
      if (slide.speaker !== lastSpeaker) {
        sparse.speaker = slide.speaker
      }
      lastSpeaker = slide.speaker
    }

    if (hasDialogue) sparse.dialogue = slide.dialogue
    return sparse
  })
}
