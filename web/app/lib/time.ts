import type { TurnTiming } from 'shared'

export function formatTiming(timing: TurnTiming): string {
  const seconds = (value: number) => `${value.toFixed(2)}s`
  const parts = [
    `ttft ${seconds(timing.ttft)}`,
    `total ${seconds(timing.total)}`,
    `${timing.tps.toFixed(2)} t/s`,
  ]
  if (timing.images.length > 0) parts.push(`img ${timing.images.map(seconds).join(' ')}`)
  return parts.join(' · ')
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
