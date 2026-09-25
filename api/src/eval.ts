import { project, type StoryEvent } from 'shared'
import { parse, stringify } from 'yaml'
import { evalRow, listEvalRows, recordEval } from './db'
import { parseChecks, scoreEvents, type Check, type CheckResult } from './eval-score'
import { replayEvents, type LlmExchange } from './turn'

const DIR = `${import.meta.dir}/../evals`

export type CaseFile = {
  rule: string
  expect: string
  pass: Check[]
  events: StoryEvent[]
  model: StoryEvent[]
}

export async function loadCase(name: string): Promise<CaseFile> {
  const path = `${DIR}/${name}.yaml`
  const file = Bun.file(path)
  if (!(await file.exists())) throw new Error(`No eval case ${name}`)
  const raw = parse(await file.text()) as Record<string, unknown>
  if (typeof raw.rule !== 'string' || typeof raw.expect !== 'string')
    throw new Error(`${name} needs rule and expect`)
  if (!Array.isArray(raw.events) || !Array.isArray(raw.model))
    throw new Error(`${name} needs events and model`)
  return {
    rule: raw.rule,
    expect: raw.expect,
    pass: parseChecks(raw.pass),
    events: raw.events as StoryEvent[],
    model: raw.model as StoryEvent[],
  }
}

export async function listCases(): Promise<string[]> {
  const names: string[] = []
  for (const file of new Bun.Glob('*.yaml').scanSync(DIR)) {
    if (file.includes('.out.') || file.includes('.before.')) continue
    names.push(file.replace(/\.yaml$/, ''))
  }
  return names.sort()
}

function summarize(events: StoryEvent[]): string[] {
  const lines: string[] = []
  for (const event of events) {
    switch (event.type) {
      case 'message':
        lines.push(`chat: ${event.text.replace(/\s+/g, ' ').slice(0, 180)}`)
        break
      case 'image':
        lines.push(`image: ${event.name}`)
        break
      case 'dialogue':
        lines.push(
          `dialogue ${event.speaker ?? '-'} @${event.index ?? 'end'}${event.replace ? ' replace' : ''}: ${(event.caption ?? '').replace(/\s+/g, ' ').slice(0, 140)}`,
        )
        break
      case 'delete':
        lines.push(`delete: ${event.indices.join(',')}`)
        break
      case 'card':
        lines.push(`card: ${event.name}`)
        break
      case 'video':
        lines.push(`video: ${event.name}`)
        break
      default: {
        const _exhaustive: never = event
        lines.push(_exhaustive)
      }
    }
  }
  return lines
}

async function runCase(name: string): Promise<boolean> {
  const evalCase = await loadCase(name)
  const sceneCount = project(evalCase.events).scenes.length
  console.log(`\n${name} (${sceneCount} scenes)`)
  const replay = await replayEvents(evalCase.events)
  const output = replay.events
  const checks = scoreEvents(output, evalCase.pass, sceneCount)
  const ok = checks.every((check) => check.ok)
  for (const check of checks)
    console.log(`  ${check.ok ? 'pass' : 'fail'}  ${check.detail}`)
  for (const line of summarize(output)) console.log(`  ${line}`)
  await Bun.write(
    `${DIR}/${name}.out.yaml`,
    stringify(
      { case: name, ok, checks: slimChecks(checks), events: output },
      { indent: 2 },
    ),
  )
  recordEval(`${name}.yaml`, output, replay.trace)
  return ok
}

export function listEvals(): { id: string; name: string; createdAt: number }[] {
  return listEvalRows().map((row) => ({
    id: row.id,
    name: row.name.replace(/\.yaml$/, ''),
    createdAt: row.created_at,
  }))
}

export async function readEval(id: string): Promise<
  | {
      id: string
      name: string
      createdAt: number
      input: StoryEvent[]
      expected: string
      output: StoryEvent[]
      trace: LlmExchange[]
    }
  | undefined
> {
  const row = evalRow(id)
  if (!row) return undefined
  const name = row.name.replace(/\.yaml$/, '')
  const evalCase = await loadCase(name)
  return {
    id: row.id,
    name,
    createdAt: row.created_at,
    input: evalCase.events,
    expected: evalCase.expect,
    output: JSON.parse(row.output) as StoryEvent[],
    trace: JSON.parse(row.trace) as LlmExchange[],
  }
}

function slimChecks(checks: CheckResult[]) {
  return checks.map((check) => ({ kind: check.kind, ok: check.ok, detail: check.detail }))
}

async function main(): Promise<void> {
  const arg = process.argv[2]
  const names = await listCases()
  if (!arg) {
    console.log(names.length > 0 ? names.join('\n') : 'usage: bun run eval <case>')
    return
  }
  const picked = arg === '--all' ? names : [arg]
  let failed = 0
  for (const name of picked) {
    const ok = await runCase(name)
    if (!ok) failed += 1
  }
  if (picked.length > 1)
    console.log(`\n${picked.length - failed}/${picked.length} passed`)
  if (failed > 0) process.exitCode = 1
}

if (import.meta.main) await main()
