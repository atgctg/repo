import { asc, eq, isNotNull } from 'drizzle-orm'
import type { TurnMessage } from 'shared'
import { database } from './db'
import { oneLine } from './eval-card'
import { parseEvents } from './events'
import { evals, stories as storyTable } from './schema'
import { saveEvalStory, StoryError } from './stories'
import { reply } from './turn'
import { loadWorld } from './worlds'

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

export async function runEvalCase(
  name: string,
  emit: (message: TurnMessage) => void,
  signal?: AbortSignal,
): Promise<void> {
  const rows = await database().select().from(evals).where(eq(evals.name, name)).limit(1)
  const evalCase = rows[0]
  if (!evalCase) throw new StoryError('Eval not found', 404)
  const world = await loadWorld(evalCase.world)
  if (!world) throw new StoryError('World not found', 404)
  const id = await saveEvalStory(name, [...world.events, ...parseEvents(evalCase.events)])
  await reply(
    id,
    { text: evalCase.input.text, selected: evalCase.input.selected },
    emit,
    signal,
    { dry: true },
  )
}
