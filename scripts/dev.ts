import { nodeDatabaseUrl } from '~/scripts/database-url'

const root = `${import.meta.dir}/..`

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const api = Bun.spawn(
  ['bun', 'x', 'wrangler', 'dev', '--config', 'api/wrangler.jsonc', '--port', '3000'],
  {
    cwd: root,
    env: {
      ...process.env,
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: nodeDatabaseUrl(
        process.env.DATABASE_URL,
      ),
    },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  },
)

const web = Bun.spawn(['bun', 'run', 'dev'], {
  cwd: `${root}/web`,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
})

const children = [api, web]

function stop(): void {
  for (const child of children) child.kill()
}

process.on('SIGINT', () => {
  stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  stop()
  process.exit(0)
})

const code = await Promise.race(children.map((child) => child.exited))
stop()
process.exit(code ?? 0)
