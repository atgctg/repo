import type { StoryEvent } from './types'

export type Check =
  | { kind: 'dialogue'; speaker?: string; has?: string; lacks?: string }
  | { kind: 'chat' }
  | { kind: 'no_scenes' }
  | { kind: 'max_images'; n: number }
  | { kind: 'indices_only'; indices: number[] }
  | { kind: 'spoken_lacks'; any: string[] }
  | { kind: 'delete_tail'; from: number }
  | { kind: 'has_delete' }
  | { kind: 'continues' }
  | { kind: 'prompts'; character: string; has?: string[]; lacks?: string[] }

export type CheckResult = { kind: string; ok: boolean; detail: string }

export function parseChecks(value: unknown): Check[] {
  if (!Array.isArray(value)) throw new Error('pass must be a list')
  return value.map(parseCheck)
}

export function scoreEvents(
  output: StoryEvent[],
  checks: Check[],
  sceneCount: number,
): CheckResult[] {
  return checks.map((check) => scoreOne(output, check, sceneCount))
}

function scoreOne(output: StoryEvent[], check: Check, sceneCount: number): CheckResult {
  switch (check.kind) {
    case 'dialogue':
      return scoreDialogue(output, check)
    case 'chat':
      return {
        kind: 'chat',
        ok: output.some((event) => event.type === 'message' && event.text.trim()),
        detail: 'plain chat reply',
      }
    case 'no_scenes':
      return {
        kind: 'no_scenes',
        ok: output.every((event) => event.type === 'message'),
        detail: 'no story edits',
      }
    case 'max_images': {
      const count = output.filter((event) => event.type === 'image').length
      return {
        kind: 'max_images',
        ok: count <= check.n,
        detail: `${count} new images, max ${check.n}`,
      }
    }
    case 'indices_only':
      return scoreIndices(output, check.indices)
    case 'spoken_lacks':
      return scoreSpokenLacks(output, check.any)
    case 'delete_tail':
      return scoreDeleteTail(output, check.from, sceneCount)
    case 'has_delete':
      return {
        kind: 'has_delete',
        ok: output.some((event) => event.type === 'delete' && event.indices.length > 0),
        detail: 'deletes scenes',
      }
    case 'continues':
      return {
        kind: 'continues',
        ok: output.some((event) => event.type === 'image' || event.type === 'dialogue'),
        detail: 'story continues after the edit',
      }
    case 'prompts':
      return scorePrompts(output, check)
    default: {
      const _exhaustive: never = check
      return _exhaustive
    }
  }
}

function scoreDialogue(
  output: StoryEvent[],
  check: Extract<Check, { kind: 'dialogue' }>,
): CheckResult {
  const lines = output.filter(
    (event) =>
      event.type === 'dialogue' &&
      (!check.speaker || event.speaker?.toLowerCase() === check.speaker.toLowerCase()),
  )
  const captions = lines.map((event) =>
    event.type === 'dialogue' ? (event.caption ?? '') : '',
  )
  const hasOk = !check.has || captions.some((caption) => has(caption, check.has ?? ''))
  const lacksOk =
    !check.lacks || captions.every((caption) => !has(caption, check.lacks ?? ''))
  const who = check.speaker ?? 'someone'
  const bits = [
    check.has ? `says "${check.has}"` : '',
    check.lacks ? `never says "${check.lacks}"` : '',
  ].filter(Boolean)
  return {
    kind: 'dialogue',
    ok: lines.length > 0 && hasOk && lacksOk,
    detail: `${who} ${bits.join(' and ') || 'speaks'}`,
  }
}

function scoreIndices(output: StoryEvent[], allowed: number[]): CheckResult {
  const bad: string[] = []
  for (const event of output) {
    if (event.type === 'image' || event.type === 'dialogue' || event.type === 'video') {
      if (event.index === undefined || !allowed.includes(event.index))
        bad.push(`${event.type}@${event.index ?? 'end'}`)
    } else if (event.type === 'delete') {
      for (const index of event.indices) {
        if (!allowed.includes(index)) bad.push(`delete@${index}`)
      }
    }
  }
  return {
    kind: 'indices_only',
    ok: bad.length === 0,
    detail: bad.length === 0 ? `only ${allowed.join(',')}` : bad.join(', '),
  }
}

function scoreSpokenLacks(output: StoryEvent[], banned: string[]): CheckResult {
  const text = spokenText(output)
  const hit = banned.filter((phrase) => has(text, phrase))
  return {
    kind: 'spoken_lacks',
    ok: hit.length === 0,
    detail: hit.length === 0 ? 'no invented facts in scenes' : `said ${hit.join(', ')}`,
  }
}

function scoreDeleteTail(
  output: StoryEvent[],
  from: number,
  sceneCount: number,
): CheckResult {
  const deleted = output.flatMap((event) =>
    event.type === 'delete' ? event.indices : [],
  )
  const missing: number[] = []
  for (let index = from; index < sceneCount; index++) {
    if (!deleted.includes(index)) missing.push(index)
  }
  const early = deleted.filter((index) => index < from)
  const ok = missing.length === 0 && early.length === 0 && sceneCount > from
  const detail = [
    early.length > 0 ? `also deleted ${early.join(',')}` : '',
    missing.length > 0 ? `left ${missing.join(',')}` : '',
    ok ? `deleted ${from}–${sceneCount - 1}` : '',
  ]
    .filter(Boolean)
    .join('; ')
  return { kind: 'delete_tail', ok, detail: detail || 'delete did not match' }
}

function scorePrompts(
  output: StoryEvent[],
  check: Extract<Check, { kind: 'prompts' }>,
): CheckResult {
  const prompts = output
    .filter((event) => event.type === 'image' && event.prompt)
    .map((event) => (event.type === 'image' ? JSON.stringify(event.prompt) : ''))
    .filter((prompt) => has(prompt, check.character))
  if (prompts.length === 0) {
    return {
      kind: 'prompts',
      ok: true,
      detail: `no new ${check.character} image`,
    }
  }
  const missing = (check.has ?? []).filter(
    (phrase) => !prompts.every((prompt) => has(prompt, phrase)),
  )
  const extra = (check.lacks ?? []).filter((phrase) =>
    prompts.some((prompt) => has(prompt, phrase)),
  )
  return {
    kind: 'prompts',
    ok: missing.length === 0 && extra.length === 0,
    detail:
      [
        ...missing.map((phrase) => `missing ${phrase}`),
        ...extra.map((phrase) => `has ${phrase}`),
      ].join(', ') || `${check.character} look matches the card`,
  }
}

function spokenText(output: StoryEvent[]): string {
  const parts: string[] = []
  for (const event of output) {
    if (event.type === 'dialogue' && event.caption) parts.push(event.caption)
    if ((event.type === 'image' || event.type === 'video') && event.prompt)
      parts.push(JSON.stringify(event.prompt))
  }
  return parts.join('\n')
}

function has(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle.toLowerCase())
}

function parseCheck(value: unknown): Check {
  if (!isRecord(value) || typeof value.kind !== 'string') throw new Error('bad check')
  switch (value.kind) {
    case 'dialogue':
      return {
        kind: 'dialogue',
        ...(typeof value.speaker === 'string' ? { speaker: value.speaker } : {}),
        ...(typeof value.has === 'string' ? { has: value.has } : {}),
        ...(typeof value.lacks === 'string' ? { lacks: value.lacks } : {}),
      }
    case 'chat':
      return { kind: 'chat' }
    case 'no_scenes':
      return { kind: 'no_scenes' }
    case 'max_images':
      if (typeof value.n !== 'number') throw new Error('max_images needs n')
      return { kind: 'max_images', n: value.n }
    case 'indices_only':
      if (!Array.isArray(value.indices)) throw new Error('indices_only needs indices')
      return {
        kind: 'indices_only',
        indices: value.indices.filter(
          (index): index is number => typeof index === 'number',
        ),
      }
    case 'spoken_lacks':
      if (!Array.isArray(value.any)) throw new Error('spoken_lacks needs any')
      return {
        kind: 'spoken_lacks',
        any: value.any.filter((phrase): phrase is string => typeof phrase === 'string'),
      }
    case 'delete_tail':
      if (typeof value.from !== 'number') throw new Error('delete_tail needs from')
      return { kind: 'delete_tail', from: value.from }
    case 'has_delete':
      return { kind: 'has_delete' }
    case 'continues':
      return { kind: 'continues' }
    case 'prompts':
      if (typeof value.character !== 'string') throw new Error('prompts needs character')
      return {
        kind: 'prompts',
        character: value.character,
        ...(Array.isArray(value.has)
          ? { has: value.has.filter((item): item is string => typeof item === 'string') }
          : {}),
        ...(Array.isArray(value.lacks)
          ? {
              lacks: value.lacks.filter(
                (item): item is string => typeof item === 'string',
              ),
            }
          : {}),
      }
    default:
      throw new Error(`unknown check ${value.kind}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
