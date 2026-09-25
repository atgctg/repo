import { project, type StoryEvent } from 'shared'
import { parse, stringify } from 'yaml'
import { database } from './db'
import { replayEvents } from './turn'
import { saveEvalStory } from './stories'

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

export type EvalStat = {
  name: string
  runs: { id: string; createdAt: number }[]
}

export async function listEvalStats(): Promise<EvalStat[]> {
  const names = await listCases()
  const rows = database()
    .query<{ id: string; case_name: string; created_at: number }, []>(
      `SELECT id, case_name, created_at FROM stories
       WHERE case_name IS NOT NULL ORDER BY created_at DESC`,
    )
    .all()
  const groups = new Map<string, EvalStat>()
  for (const name of names) groups.set(name, { name, runs: [] })
  for (const row of rows) {
    const group = groups.get(row.case_name) ?? { name: row.case_name, runs: [] }
    group.runs.push({ id: row.id, createdAt: row.created_at })
    groups.set(row.case_name, group)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
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
