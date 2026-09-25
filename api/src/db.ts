import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { DATA_DIR } from './files'

export type StoryRow = {
  id: string
  world: string
  title: string
  events: string
  created_at: number
  updated_at: number
}

let handle: Database | undefined

export function useDatabase(path: string): void {
  handle?.close()
  handle = openDatabase(path)
}

export function database(): Database {
  if (!handle) handle = openDatabase(process.env.STUDIO_DB ?? `${DATA_DIR}/studio.db`)
  return handle
}

function openDatabase(path: string): Database {
  if (path !== ':memory:') {
    const dir = path.slice(0, path.lastIndexOf('/'))
    if (dir) mkdirSync(dir, { recursive: true })
  }
  const db = new Database(path, { create: true })
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(`CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  world TEXT NOT NULL,
  title TEXT NOT NULL,
  events TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`)
  db.exec(`CREATE TABLE IF NOT EXISTS evals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  output TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`)
  return db
}

export function recordEval(name: string, output: unknown): void {
  database()
    .query('INSERT INTO evals (id, name, output, created_at) VALUES (?, ?, ?, ?)')
    .run(crypto.randomUUID(), name, JSON.stringify(output), Date.now())
}
