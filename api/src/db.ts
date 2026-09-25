import { AsyncLocalStorage } from 'node:async_hooks'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'
import * as schema from './schema'

export type VerseDb = NodePgDatabase<typeof schema>

const storage = new AsyncLocalStorage<VerseDb>()
let fallback: VerseDb | undefined

export function useDatabase(db: VerseDb): void {
  fallback = db
}

export function database(): VerseDb {
  const db = storage.getStore() ?? fallback
  if (!db) throw new Error('Database is not open')
  return db
}

export function enterDatabase<T>(db: VerseDb, run: () => Promise<T>): Promise<T> {
  return storage.run(db, run)
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
