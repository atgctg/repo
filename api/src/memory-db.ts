import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { listEvalWorlds } from '../scripts/eval'
import { memoryAssets } from './assets'
import { useApp } from './context'
import type { VerseDb } from './db'
import * as schema from './schema'
import { worlds } from './schema'

export async function useMemoryDatabase(): Promise<void> {
  const db = drizzle({ client: new PGlite(), schema })
  await migrate(db, { migrationsFolder: `${import.meta.dir}/../drizzle` })
  const seeds = await listEvalWorlds()
  await db.insert(worlds).values(seeds.map((world) => ({ ...world, listed: true })))
  useApp({
    db: db as unknown as VerseDb,
    assets: memoryAssets(),
    env: {},
    waitUntil() {},
  })
}
