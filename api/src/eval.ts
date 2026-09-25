import { asc, eq, isNotNull } from 'drizzle-orm'
import { project, type InputEvent, type StoryEvent } from 'shared'
import { parse, stringify } from 'yaml'
import { database } from './db'
import { evals, stories as storyTable } from './schema'
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

function verdictOf(passed: boolean | null): EvalVerdict | null {
  if (passed === true) return 'pass'
  if (passed === false) return 'fail'
  return null
}

export async function listEvalRuns(): Promise<EvalRun[]> {
  const cases = await database().select().from(evals)
  const descriptions = new Map(cases.map((row) => [row.name, oneLine(row.description)]))
  const rows = await database()
    .select({
      id: storyTable.id,
      caseName: storyTable.caseName,
      passed: storyTable.passed,
    })
    .from(storyTable)
    .where(isNotNull(storyTable.caseName))
    .orderBy(asc(storyTable.createdAt))
  return rows.flatMap((row) => {
    if (!row.caseName) return []
    return [
      {
        id: row.id,
        caseName: row.caseName,
        description: descriptions.get(row.caseName) ?? '',
        verdict: verdictOf(row.passed),
      },
    ]
  })
}

export async function setVerdict(id: string, verdict: EvalVerdict | null): Promise<void> {
  const rows = await database()
    .select({ caseName: storyTable.caseName })
    .from(storyTable)
    .where(eq(storyTable.id, id))
    .limit(1)
  const row = rows[0]
  if (!row?.caseName) throw new StoryError('Eval not found', 404)
  const passed = verdict === 'pass' ? true : verdict === 'fail' ? false : null
  await database().update(storyTable).set({ passed }).where(eq(storyTable.id, id))
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
