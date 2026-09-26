import { isPlainObject } from './records'
import type { StoryEvent, TurnPhase, TurnTiming, TurnUsage } from './types'

export type TurnMessage =
  | { type: 'start'; turn: number; keep: number }
  | { type: 'event'; at: number; event: StoryEvent }
  | { type: 'status'; phase: TurnPhase; name?: string; ms?: number }
  | { type: 'asset'; name: string; kind: 'image' | 'video' | 'voice'; url: string }
  | { type: 'done'; ms: number; timing?: TurnTiming }
  | { type: 'error'; error: string; length: number }

function isTurnUsage(value: unknown): value is TurnUsage {
  return (
    isPlainObject(value) &&
    typeof value.input === 'number' &&
    typeof value.output === 'number' &&
    typeof value.total === 'number' &&
    typeof value.cached === 'number'
  )
}

export function isTurnTiming(value: unknown): value is TurnTiming {
  return (
    isPlainObject(value) &&
    typeof value.ttft === 'number' &&
    typeof value.total === 'number' &&
    typeof value.tps === 'number' &&
    Array.isArray(value.images) &&
    value.images.every((item) => typeof item === 'number') &&
    (value.usage === undefined || isTurnUsage(value.usage))
  )
}

export function isTurnMessage(value: unknown): value is TurnMessage {
  if (!isPlainObject(value)) return false
  switch (value.type) {
    case 'start':
      return typeof value.turn === 'number' && typeof value.keep === 'number'
    case 'event':
      return (
        typeof value.at === 'number' &&
        isPlainObject(value.event) &&
        typeof value.event.type === 'string'
      )
    case 'status':
      return (
        value.phase === 'model' ||
        value.phase === 'image' ||
        value.phase === 'video' ||
        value.phase === 'voice'
      )
    case 'asset':
      return (
        typeof value.name === 'string' &&
        (value.kind === 'image' || value.kind === 'video' || value.kind === 'voice') &&
        typeof value.url === 'string'
      )
    case 'done':
      return (
        typeof value.ms === 'number' &&
        (value.timing === undefined || isTurnTiming(value.timing))
      )
    case 'error':
      return typeof value.error === 'string' && typeof value.length === 'number'
    default:
      return false
  }
}
