import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { memoryAssets } from './assets'
import { useApp } from './context'
import { database, type VerseDb } from './db'
import { parseEvents } from './events'
import * as schema from './schema'
import { worlds } from './schema'

export async function useMemoryDatabase(): Promise<void> {
  const client = new PGlite()
  const db = drizzle({ client, schema })
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  })
  useApp({
    db: db as unknown as VerseDb,
    assets: memoryAssets(),
    env: {},
    waitUntil() {},
  })
  const dir = `${import.meta.dir}/../../data/worlds`
  for (const file of new Bun.Glob('*.yaml').scanSync(dir)) {
    const raw = parse(await Bun.file(`${dir}/${file}`).text()) as Record<string, unknown>
    const id = file.replace(/\.yaml$/, '')
    const title = typeof raw.title === 'string' ? raw.title : id
    await database()
      .insert(worlds)
      .values({ id, title, events: parseEvents(raw.events), listed: true })
  }
}
