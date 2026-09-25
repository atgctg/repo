import { AsyncLocalStorage } from 'node:async_hooks'
import type { AssetStore } from './assets'
import type { VerseDb } from './db'

export type Secrets = {
  FIREWORKS_API_KEY?: string
  PRUNA_API_KEY?: string
  CARTESIA_API_KEY?: string
  ADMIN_PASSWORD?: string
}

export type AppContext = {
  db: VerseDb
  assets: AssetStore
  env: Secrets
  waitUntil: (promise: Promise<unknown>) => void
}

const storage = new AsyncLocalStorage<AppContext>()
let fallback: AppContext | undefined

export function useApp(ctx: AppContext): void {
  fallback = ctx
}

export function app(): AppContext {
  const value = storage.getStore() ?? fallback
  if (!value) throw new Error('App context is not open')
  return value
}

export function enterApp<T>(ctx: AppContext, run: () => Promise<T>): Promise<T> {
  return storage.run(ctx, run)
}
