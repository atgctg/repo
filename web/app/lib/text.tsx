import type { ReactNode } from 'react'
import { formatRanges } from 'shared'

export function stripSpeechTags(text: string): string {
  return text
    .replace(/\[laughter\]/gi, '')
    .replace(/<(speed|volume|emotion|break|spell)\b[^>]*\/>/gi, ' ')
    .replace(/<\/?(speed|volume|emotion|break|spell)\b[^>]*>/gi, '')
    .replace(/^[ \t]+/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
}

export function captionLines(caption?: string): string[] {
  if (!caption) return []
  return caption
    .split('\n')
    .map((line) =>
      stripSpeechTags(line)
        .replace(/[ \t]{2,}/g, ' ')
        .trim(),
    )
    .filter(Boolean)
}

export function captionSize(lines: string[]): 'lg' | 'md' | 'sm' {
  const clean = lines.map((line) => line.replace(/\*/g, '').trim())
  const total = clean.reduce((sum, line) => sum + line.length, 0)
  if (lines.length > 1) return total <= 80 ? 'md' : 'sm'
  const len = clean[0]?.length ?? 0
  if (len <= 50) return 'lg'
  if (len <= 100) return 'md'
  return 'sm'
}

export function messageText(input: string, selected: number[]): string {
  const body = input.replace(/^<selected>\n[\s\S]*?\n<\/selected>\n?/, '').trim()
  if (!body) return ''
  if (selected.length === 0) return body
  return `<selected>\n${formatRanges(selected)}\n</selected>\n${body}`
}

export function RichText({ text }: { text: string }): ReactNode {
  const clean = stripSpeechTags(text).trim()
  const nodes: ReactNode[] = []
  const pattern = /\*\*\*([^*]+?)\*\*\*|\*\*([^*]+?)\*\*|\*([^*]+?)\*/g
  let last = 0
  for (const match of clean.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) nodes.push(clean.slice(last, index))
    if (match[1])
      nodes.push(
        <strong key={index}>
          <em>{match[1]}</em>
        </strong>,
      )
    else if (match[2]) nodes.push(<strong key={index}>{match[2]}</strong>)
    else if (match[3]) nodes.push(<em key={index}>{match[3]}</em>)
    last = index + match[0].length
  }
  if (last < clean.length) nodes.push(clean.slice(last))
  return nodes
}
