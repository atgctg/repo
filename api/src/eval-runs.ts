import { and, asc, eq, isNotNull } from 'drizzle-orm'
import type { EvalRun, EvalVerdict, TurnMessage } from 'shared'
import { database } from './db'
import { parseEvents } from './events'
import { evals, stories as storyTable } from './schema'
import { saveEvalStory, StoryError } from './stories'
import { reply } from './turn'
import { findWorld } from './worlds'

function verdictOf(passed: boolean | null): EvalVerdict | null {
  if (passed === true) return 'pass'
  if (passed === false) return 'fail'
  return null
}

export async function listEvalRuns(): Promise<EvalRun[]> {
  const rows = await database()
    .select({
      id: storyTable.id,
      caseName: storyTable.caseName,
      passed: storyTable.passed,
      description: evals.description,
    })
    .from(storyTable)
    .leftJoin(evals, eq(evals.name, storyTable.caseName))
    .where(isNotNull(storyTable.caseName))
    .orderBy(asc(storyTable.createdAt))
  return rows.flatMap(({ id, caseName, passed, description }) =>
    caseName
      ? [
          {
            id,
            caseName,
            description: description?.replace(/\s+/g, ' ').trim() ?? '',
            verdict: verdictOf(passed),
          },
        ]
      : [],
  )
}

export async function setVerdict(id: string, verdict: EvalVerdict | null): Promise<void> {
  const passed = verdict === 'pass' ? true : verdict === 'fail' ? false : null
  const updated = await database()
    .update(storyTable)
    .set({ passed })
    .where(and(eq(storyTable.id, id), isNotNull(storyTable.caseName)))
    .returning({ id: storyTable.id })
  if (updated.length === 0) throw new StoryError('Eval not found', 404)
}

export async function prepareEvalCase(
  name: string,
): Promise<
  (emit: (message: TurnMessage) => void, signal?: AbortSignal) => Promise<void>
> {
  const rows = await database().select().from(evals).where(eq(evals.name, name)).limit(1)
  const evalCase = rows[0]
  if (!evalCase) throw new StoryError('Eval not found', 404)
  const world = await findWorld(evalCase.world)
  if (!world) throw new StoryError('World not found', 404)
  return async (emit, signal) => {
    const id = await saveEvalStory(name, world.id, [
      ...world.events,
      ...parseEvents(evalCase.events),
    ])
    await reply(
      id,
      { text: evalCase.input.text, selected: evalCase.input.selected },
      emit,
      signal,
      { dry: true },
    )
  }
}
