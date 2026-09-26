import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client } from 'pg'
import { listCases, listEvalWorlds, loadCase } from './eval'
import * as schema from '~/src/schema'
import { evals, worlds } from '~/src/schema'
import { nodeDatabaseUrl } from './database-url'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const client = new Client({ connectionString: nodeDatabaseUrl(connectionString) })
await client.connect()
const db = drizzle({ client, schema })

const excluded = (column: string) => sql.raw(`excluded.${column}`)

try {
  await migrate(db, { migrationsFolder: `${import.meta.dir}/../drizzle` })
  const worldRows = (await listEvalWorlds()).map((world) => ({ ...world, listed: false }))
  const names = await listCases()
  const evalRows = await Promise.all(
    names.map(async (name) => ({ name, ...(await loadCase(name)) })),
  )
  await db.transaction(async (tx) => {
    await tx
      .insert(worlds)
      .values(worldRows)
      .onConflictDoUpdate({
        target: worlds.id,
        set: {
          title: excluded('title'),
          events: excluded('events'),
          listed: excluded('listed'),
        },
      })
    await tx
      .insert(evals)
      .values(evalRows)
      .onConflictDoUpdate({
        target: evals.name,
        set: {
          description: excluded('description'),
          world: excluded('world'),
          events: excluded('events'),
          input: excluded('input'),
        },
      })
  })
  console.log(`imported ${worldRows.length} worlds and ${evalRows.length} evals`)
} finally {
  await client.end()
}
