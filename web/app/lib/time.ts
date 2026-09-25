import type { TurnPhase } from 'shared'
import type { Activity } from './store'

export function elapsed(now: number, started: number): string {
  return formatMs(Math.max(0, (now > 0 ? now : Date.now()) - started))
}

export function formatMs(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function phaseLabel(phase: TurnPhase): string | undefined {
  switch (phase) {
    case 'model':
      return undefined
    case 'image':
    case 'video':
    case 'voice':
      return phase
    default: {
      const _exhaustive: never = phase
      return _exhaustive
    }
  }
}

export function statusText(activity: Activity, now: number): string | null {
  const parts: string[] = []
  if (activity.turnStartedAt) parts.push(elapsed(now, activity.turnStartedAt))
  const label = activity.phase ? phaseLabel(activity.phase) : undefined
  if (label) {
    if (activity.phaseMs !== undefined)
      parts.push(`${label} ${formatMs(activity.phaseMs)}`)
    else if (activity.phaseStartedAt)
      parts.push(`${label} ${elapsed(now, activity.phaseStartedAt)}`)
  }
  if (parts.length > 0) return parts.join(' · ')
  if (activity.error) return activity.error
  return null
}

export function ago(then: number, now: number): string {
  const safeNow = now > 0 ? now : Date.now()
  const seconds = Math.max(0, Math.round((safeNow - then) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}
