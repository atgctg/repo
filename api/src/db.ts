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
  case_name: string | null
  passed: number | null
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
  db.run('PRAGMA journal_mode = WAL')
  db.run(`CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  world TEXT NOT NULL,
  title TEXT NOT NULL,
  events TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  case_name TEXT,
  passed INTEGER
)`)
  const columns = db.query<{ name: string }, []>('PRAGMA table_info(stories)').all()
  if (!columns.some((column) => column.name === 'case_name'))
    db.run('ALTER TABLE stories ADD COLUMN case_name TEXT')
  if (!columns.some((column) => column.name === 'passed'))
    db.run('ALTER TABLE stories ADD COLUMN passed INTEGER')
  return db
}
