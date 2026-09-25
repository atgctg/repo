const root = `${import.meta.dir}/..`

const api = Bun.spawn(['bun', '--hot', 'api/src/server.ts'], {
  cwd: root,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
})

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
