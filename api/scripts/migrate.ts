import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client } from 'pg'
import { nodeDatabaseUrl } from './database-url'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const client = new Client({ connectionString: nodeDatabaseUrl(connectionString) })
await client.connect()
try {
  await migrate(drizzle({ client }), {
    migrationsFolder: `${import.meta.dir}/../drizzle`,
  })
} finally {
  await client.end()
}
