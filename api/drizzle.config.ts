import { defineConfig } from 'drizzle-kit'
import { nodeDatabaseUrl } from './scripts/database-url'

const databaseUrl = process.env.DATABASE_URL

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl
      ? nodeDatabaseUrl(databaseUrl)
      : 'postgres://postgres:postgres@localhost:5432/verse',
  },
})
