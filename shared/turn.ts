import type { StoryEvent, TurnPhase, TurnTiming, TurnUsage } from './types'

export type TurnMessage =
  | { type: 'start'; turn: number; keep: number }
  | { type: 'event'; at: number; event: StoryEvent }
  | { type: 'status'; phase: TurnPhase; name?: string; ms?: number }
  | { type: 'asset'; name: string; kind: 'image' | 'video' | 'voice'; url: string }
  | { type: 'done'; ms: number; timing?: TurnTiming }
  | { type: 'error'; error: string; length: number }

function isTurnUsage(value: unknown): value is TurnUsage {
  if (value === null || typeof value !== 'object') return false
  const usage = value as Record<string, unknown>
  return (
    typeof usage.input === 'number' &&
    typeof usage.output === 'number' &&
    typeof usage.total === 'number' &&
    typeof usage.cached === 'number'
  )
}

export function isTurnTiming(value: unknown): value is TurnTiming {
  if (value === null || typeof value !== 'object') return false
  const timing = value as Record<string, unknown>
  return (
    typeof timing.ttft === 'number' &&
    typeof timing.total === 'number' &&
    typeof timing.tps === 'number' &&
    Array.isArray(timing.images) &&
    timing.images.every((item) => typeof item === 'number') &&
    (timing.usage === undefined || isTurnUsage(timing.usage))
  )
}

export function isTurnMessage(value: unknown): value is TurnMessage {
  if (value === null || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  switch (message.type) {
    case 'start':
      return typeof message.turn === 'number' && typeof message.keep === 'number'
    case 'event':
      return (
        typeof message.at === 'number' &&
        message.event !== null &&
        typeof message.event === 'object' &&
        typeof (message.event as { type?: unknown }).type === 'string'
      )
    case 'status':
      return (
        message.phase === 'model' ||
        message.phase === 'image' ||
        message.phase === 'video' ||
        message.phase === 'voice'
      )
    case 'asset':
      return (
        typeof message.name === 'string' &&
        (message.kind === 'image' ||
          message.kind === 'video' ||
          message.kind === 'voice') &&
        typeof message.url === 'string'
      )
    case 'done':
      return (
        typeof message.ms === 'number' &&
        (message.timing === undefined || isTurnTiming(message.timing))
      )
    case 'error':
      return typeof message.error === 'string' && typeof message.length === 'number'
    default:
      return false
  }
}
