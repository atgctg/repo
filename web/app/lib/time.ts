import type { TurnTiming, TurnUsage } from 'shared'

export function timingRows(timing: TurnTiming): [string, string][] {
  const seconds = (value: number) => `${value.toFixed(2)}s`
  return [
    ['ttft', seconds(timing.ttft)],
    ['total', seconds(timing.total)],
    ['t/s', timing.tps.toFixed(2)],
    ...timing.images.map((value, index): [string, string] => [
      timing.images.length > 1 ? `img ${index + 1}` : 'img',
      seconds(value),
    ]),
    ...(timing.usage ? usageRows(timing.usage) : []),
  ]
}

function usageRows(usage: TurnUsage): [string, string][] {
  const tokens = (value: number) => value.toLocaleString('en-US')
  const hit = usage.input > 0 ? (usage.cached / usage.input) * 100 : 0
  return [
    ['input', tokens(usage.input)],
    ['output', tokens(usage.output)],
    ['tokens', tokens(usage.total)],
    ['cached', tokens(usage.cached)],
    ['cache hit', `${hit.toFixed(1)}%`],
  ]
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
