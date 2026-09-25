import { boolean, json, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import type { StoryEvent, TurnTiming } from 'shared'

export type EvalInput = {
  text: string
  selected?: number[]
}

export const worlds = pgTable('worlds', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  events: json('events').$type<StoryEvent[]>().notNull(),
  listed: boolean('listed').notNull().default(true),
})

export const stories = pgTable('stories', {
  id: text('id').primaryKey(),
  world: text('world').notNull(),
  title: text('title').notNull(),
  events: json('events').$type<StoryEvent[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
  timing: json('timing').$type<TurnTiming>(),
  caseName: text('case_name'),
  passed: boolean('passed'),
})

export const evals = pgTable('evals', {
  name: text('name').primaryKey(),
  description: text('description').notNull(),
  world: text('world').notNull(),
  events: json('events').$type<StoryEvent[]>().notNull(),
  input: json('input').$type<EvalInput>().notNull(),
})
