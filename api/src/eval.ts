import { project, type InputEvent, type StoryEvent } from 'shared'
import { parse, stringify } from 'yaml'
import { database } from './db'
import { parseEvents } from './events'
import { oneLine } from './eval-card'
import { replayEvents } from './turn'
import { saveEvalStory, StoryError } from './stories'

const DIR = `${import.meta.dir}/../evals`
const WORLDS = `${DIR}/worlds`

const EVENT_KEYS: Record<string, readonly string[]> = {
  input: ['type', 'text', 'selected', 'pasted', 'voice', 'error'],
  output: ['type', 'text', 'error'],
  image: [
    'type',
    'name',
    'prompt',
    'width',
    'height',
    'dominantColor',
    'references',
    'index',
    'replace',
    'error',
  ],
  dialogue: ['type', 'background', 'caption', 'speaker', 'index', 'replace', 'error'],
  video: [
    'type',
    'name',
    'prompt',
    'width',
    'height',
    'dominantColor',
    'references',
    'firstFrame',
    'lastFrame',
    'duration',
    'index',
    'replace',
    'error',
  ],
  card: ['type', 'name', 'cover', 'voice', 'attributes', 'error'],
  delete: ['type', 'indices', 'error'],
}

export type CaseFile = {
  description: string
  world: string
  events: StoryEvent[]
  input: { text: string; selected?: number[] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function strictEvents(raw: unknown, label: string): StoryEvent[] {
  if (!Array.isArray(raw)) throw new Error(`${label} needs events`)
  for (const [index, item] of raw.entries()) {
    if (!isRecord(item) || typeof item.type !== 'string')
      throw new Error(`${label} event ${index} does not fit the event types`)
    const allowed = EVENT_KEYS[item.type]
    if (!allowed)
      throw new Error(`${label} event ${index} type ${item.type} does not fit`)
    for (const key of Object.keys(item)) {
      if (!allowed.includes(key))
        throw new Error(`${label} event ${index} field ${key} does not fit`)
    }
  }
  const parsed = parseEvents(raw)
  if (parsed.length !== raw.length)
    throw new Error(`${label} has an event that does not fit the event types`)
  return parsed
}

function readInput(raw: unknown, name: string): CaseFile['input'] {
  if (!isRecord(raw)) throw new Error(`${name} needs input`)
  for (const key of Object.keys(raw)) {
    if (key !== 'text' && key !== 'selected')
      throw new Error(`${name} input.${key} does not fit`)
  }
  if (typeof raw.text !== 'string') throw new Error(`${name} input needs text`)
  if (raw.selected === undefined) return { text: raw.text }
  if (
    !Array.isArray(raw.selected) ||
    raw.selected.some((item) => typeof item !== 'number' || !Number.isInteger(item))
  )
    throw new Error(`${name} input.selected does not fit`)
  return { text: raw.text, selected: raw.selected }
}

async function loadWorldEvents(name: string): Promise<StoryEvent[]> {
  const file = Bun.file(`${WORLDS}/${name}.yaml`)
  if (!(await file.exists())) throw new Error(`No eval world ${name}`)
  const raw = parse(await file.text()) as Record<string, unknown>
  return strictEvents(raw.events, name)
}

export async function loadCase(name: string): Promise<CaseFile> {
  const file = Bun.file(`${DIR}/${name}.yaml`)
  if (!(await file.exists())) throw new Error(`No eval case ${name}`)
  const raw = parse(await file.text()) as Record<string, unknown>
  if (typeof raw.description !== 'string') throw new Error(`${name} needs description`)
  if (typeof raw.world !== 'string') throw new Error(`${name} needs a world`)
  return {
    description: raw.description,
    world: raw.world,
    events: raw.events === undefined ? [] : strictEvents(raw.events, name),
    input: readInput(raw.input, name),
  }
}

export async function caseEvents(name: string): Promise<StoryEvent[]> {
  const evalCase = await loadCase(name)
  const world = await loadWorldEvents(evalCase.world)
  const input: InputEvent = {
    type: 'input',
    text: evalCase.input.text,
    ...(evalCase.input.selected && evalCase.input.selected.length > 0
      ? { selected: evalCase.input.selected }
      : {}),
  }
  return [...world, ...evalCase.events, input]
}

export async function listCases(): Promise<string[]> {
  const names: string[] = []
  let files: string[]
  try {
    files = [...new Bun.Glob('*.yaml').scanSync(DIR)]
  } catch {
    return []
  }
  for (const file of files) {
    if (file.includes('.out.') || file.includes('.before.')) continue
    names.push(file.replace(/\.yaml$/, ''))
  }
  return names.sort()
}

function summarize(events: StoryEvent[]): string[] {
  const lines: string[] = []
  for (const event of events) {
    switch (event.type) {
      case 'input':
        lines.push(`chat: ${event.text.replace(/\s+/g, ' ').slice(0, 180)}`)
        break
      case 'output':
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
  const events = await caseEvents(name)
  const sceneCount = project(events).scenes.length
  console.log(`\n${name} (${sceneCount} scenes)`)
  const replay = await replayEvents(events)
  const output = replay.events
  for (const line of summarize(output)) console.log(`  ${line}`)
  await Bun.write(
    `${DIR}/${name}.out.yaml`,
    stringify({ case: name, events: output }, { indent: 2 }),
  )
  await saveEvalStory(name, [...events, ...output])
  console.log(`${name} done`)
}

export type EvalVerdict = 'pass' | 'fail'

export type EvalRun = {
  id: string
  caseName: string
  description: string
  verdict: EvalVerdict | null
}

type EvalRow = {
  id: string
  case_name: string
  passed: number | null
}

function verdictOf(passed: number | null): EvalVerdict | null {
  if (passed === 1) return 'pass'
  if (passed === 0) return 'fail'
  return null
}

export async function listEvalRuns(): Promise<EvalRun[]> {
  const descriptions = new Map<string, string>()
  for (const name of await listCases()) {
    try {
      descriptions.set(name, oneLine((await loadCase(name)).description))
    } catch {
      descriptions.set(name, '')
    }
  }
  const rows = database()
    .query<EvalRow, []>(
      `SELECT id, case_name, passed FROM stories
       WHERE case_name IS NOT NULL ORDER BY created_at ASC`,
    )
    .all()
  return rows.map((row) => ({
    id: row.id,
    caseName: row.case_name,
    description: descriptions.get(row.case_name) ?? '',
    verdict: verdictOf(row.passed),
  }))
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
