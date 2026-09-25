export function stripSpeechTags(text: string): string {
  return text
    .replace(/\[laughter\]/gi, '')
    .replace(/<(speed|volume|emotion|break|spell)\b[^>]*\/>/gi, ' ')
    .replace(/<\/?(speed|volume|emotion|break|spell)\b[^>]*>/gi, '')
    .replace(/^[ \t]+/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
}
