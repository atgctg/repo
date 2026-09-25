import { project, type StoryEvent } from 'shared'
import { parse, stringify } from 'yaml'
import { database } from './db'
import { oneLine, turnView } from './eval-card'
import { parseEvents } from './events'
import { replayEvents } from './turn'
import { saveEvalStory, StoryError } from './stories'

const DIR = `${import.meta.dir}/../evals`

export type CaseFile = {
  rule: string
  expect: string
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

async function runCase(name: string): Promise<void> {
  const evalCase = await loadCase(name)
  const sceneCount = project(evalCase.events).scenes.length
  console.log(`\n${name} (${sceneCount} scenes)`)
  const replay = await replayEvents(evalCase.events)
  const output = replay.events
  for (const line of summarize(output)) console.log(`  ${line}`)
  await Bun.write(
    `${DIR}/${name}.out.yaml`,
    stringify({ case: name, events: output }, { indent: 2 }),
  )
  await saveEvalStory(name, [...evalCase.events, ...output])
  console.log(`${name} done`)
}

export type EvalVerdict = 'pass' | 'fail'

export type EvalCard = {
  id: string
  caseName: string
  rule: string
  expect: string
  prompt: string
  output: string[]
  context: string[]
  verdict: EvalVerdict | null
}

export type EvalCount = {
  name: string
  pass: number
  fail: number
}

export type EvalReview = {
  cards: EvalCard[]
  counts: EvalCount[]
}

type EvalRow = {
  id: string
  case_name: string
  events: string
  passed: number | null
}

function verdictOf(passed: number | null): EvalVerdict | null {
  if (passed === 1) return 'pass'
  if (passed === 0) return 'fail'
  return null
}

async function caseMeta(name: string): Promise<{ rule: string; expect: string }> {
  try {
    const file = await loadCase(name)
    return { rule: oneLine(file.rule), expect: oneLine(file.expect) }
  } catch {
    return { rule: '', expect: '' }
  }
}

function cardFrom(row: EvalRow, meta: { rule: string; expect: string }): EvalCard {
  let events: StoryEvent[] = []
  try {
    events = parseEvents(JSON.parse(row.events) as unknown)
  } catch {
    events = []
  }
  const view = turnView(events)
  return {
    id: row.id,
    caseName: row.case_name,
    rule: meta.rule,
    expect: meta.expect,
    prompt: view.prompt,
    output: view.output,
    context: view.context,
    verdict: verdictOf(row.passed),
  }
}

function evalRows(): EvalRow[] {
  return database()
    .query<EvalRow, []>(
      `SELECT id, case_name, events, passed FROM stories
       WHERE case_name IS NOT NULL ORDER BY created_at ASC`,
    )
    .all()
}

export async function listReview(): Promise<EvalReview> {
  const names = await listCases()
  const metas = new Map<string, { rule: string; expect: string }>()
  for (const name of names) metas.set(name, await caseMeta(name))
  const counts = new Map<string, EvalCount>(
    names.map((name) => [name, { name, pass: 0, fail: 0 }]),
  )
  const cards: EvalCard[] = []
  for (const row of evalRows()) {
    const count = counts.get(row.case_name) ?? { name: row.case_name, pass: 0, fail: 0 }
    if (row.passed === 1) count.pass += 1
    else if (row.passed === 0) count.fail += 1
    counts.set(row.case_name, count)
    if (row.passed === null) {
      cards.push(cardFrom(row, metas.get(row.case_name) ?? { rule: '', expect: '' }))
    }
  }
  return {
    cards,
    counts: [...counts.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export async function evalCard(id: string): Promise<EvalCard | undefined> {
  const row = database()
    .query<EvalRow, [string]>(
      `SELECT id, case_name, events, passed FROM stories
       WHERE id = ? AND case_name IS NOT NULL`,
    )
    .get(id)
  if (!row) return undefined
  return cardFrom(row, await caseMeta(row.case_name))
}

export function setVerdict(id: string, verdict: EvalVerdict | null): void {
  const row = database()
    .query<{ case_name: string | null }, [string]>(
      'SELECT case_name FROM stories WHERE id = ?',
    )
    .get(id)
  if (!row?.case_name) throw new StoryError('Eval not found', 404)
  const passed = verdict === 'pass' ? 1 : verdict === 'fail' ? 0 : null
  database().query('UPDATE stories SET passed = ? WHERE id = ?').run(passed, id)
}

async function main(): Promise<void> {
  const arg = process.argv[2]
  const names = await listCases()
  if (!arg) {
    console.log(names.length > 0 ? names.join('\n') : 'usage: bun run eval <case>')
    return
  }
  const picked = arg === '--all' ? names : [arg]
  for (const name of picked) await runCase(name)
}

if (import.meta.main) await main()
