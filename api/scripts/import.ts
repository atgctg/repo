import { rm } from 'node:fs/promises'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client } from 'pg'
import { parse } from 'yaml'
import { listCases, loadCase } from './eval'
import { parseEvents } from '../src/events'
import { safeStoryId } from '../src/files'
import * as schema from '../src/schema'
import { evals, worlds } from '../src/schema'
import { nodeDatabaseUrl } from './database-url'

const root = `${import.meta.dir}/../..`
const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const client = new Client({ connectionString: nodeDatabaseUrl(connectionString) })
await client.connect()
const db = drizzle({ client, schema })

try {
  await migrate(db, { migrationsFolder: `${import.meta.dir}/../drizzle` })
  await importWorlds(`${root}/api/evals/worlds`, false)
  await importWorlds(`${root}/data/worlds`, true)
  for (const name of await listCases()) {
    const evalCase = await loadCase(name)
    await db
      .insert(evals)
      .values({
        name,
        description: evalCase.description,
        world: evalCase.world,
        events: evalCase.events,
        input: evalCase.input,
      })
      .onConflictDoUpdate({
        target: evals.name,
        set: {
          description: evalCase.description,
          world: evalCase.world,
          events: evalCase.events,
          input: evalCase.input,
        },
      })
    console.log(`eval ${name}`)
  }
  await rm(`${root}/data`, { recursive: true, force: true })
  console.log('deleted data/')
} finally {
  await client.end()
}

async function importWorlds(dir: string, listed: boolean): Promise<void> {
  let files: string[]
  try {
    files = [...new Bun.Glob('*.yaml').scanSync(dir)]
  } catch {
    throw new Error(`No worlds in ${dir}`)
  }
  for (const file of files) {
    const raw = parse(await Bun.file(`${dir}/${file}`).text()) as Record<string, unknown>
    const id = safeStoryId(file.replace(/\.yaml$/, ''))
    const title = typeof raw.title === 'string' ? raw.title : id
    const events = parseEvents(raw.events)
    await db.insert(worlds).values({ id, title, events, listed }).onConflictDoUpdate({
      target: worlds.id,
      set: { title, events, listed },
    })
    console.log(`world ${id}`)
  }
}
