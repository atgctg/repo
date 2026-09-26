import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'
import { app } from './context'
import * as schema from './schema'

export type VerseDb = NodePgDatabase<typeof schema>

export function database(): VerseDb {
  return app().db
}

export async function openDatabase(connectionString: string): Promise<{
  db: VerseDb
  close: () => Promise<void>
}> {
  const client = new Client({ connectionString })
  await client.connect()
  return {
    db: drizzle({ client, schema }),
    close: () => client.end(),
  }
}
