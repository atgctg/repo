import type { ReactNode } from 'react'
import { Link } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import { fetchEvalStats, type EvalStat } from '~/lib/api'
import { ago } from '~/lib/time'
import { tokens } from '~/styles/tokens.stylex'
import type { Route } from './+types/eval'

const styles = stylex.create({
  page: {
    minHeight: '100dvh',
    padding: '1.5rem 1.25rem 3rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    backgroundColor: tokens.bg,
    color: tokens.text,
  },
  back: {
    color: tokens.muted,
    fontSize: tokens.textSm,
  },
  case: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  stat: {
    fontSize: tokens.textMd,
    fontWeight: 600,
  },
  count: {
    color: tokens.muted,
    fontWeight: 500,
  },
  runs: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
    paddingLeft: '0.15rem',
  },
  run: {
    color: tokens.text,
    fontSize: tokens.textSm,
  },
  idle: {
    color: tokens.muted,
    fontWeight: 500,
  },
})

export async function clientLoader(): Promise<EvalStat[]> {
  return fetchEvalStats()
}

clientLoader.hydrate = true as const

export function HydrateFallback(): ReactNode {
  return <p {...stylex.props(styles.back)}>Loading</p>
}

export default function EvalRoute({ loaderData }: Route.ComponentProps): ReactNode {
  const now = Date.now()
  return (
    <main {...stylex.props(styles.page)}>
      <Link to="/" {...stylex.props(styles.back)}>
        Back
      </Link>
      {loaderData.length === 0 ? (
        <p {...stylex.props(styles.back)}>No eval runs</p>
      ) : null}
      {loaderData.map((item) =>
        item.total === 0 ? (
          <h2 key={item.name} {...stylex.props(styles.stat, styles.idle)}>
            {item.name} <span>not run</span>
          </h2>
        ) : (
          <section key={item.name} {...stylex.props(styles.case)}>
            <h2 {...stylex.props(styles.stat)}>
              {item.name}{' '}
              <span {...stylex.props(styles.count)}>
                {item.passed}/{item.total}
              </span>
            </h2>
            <div {...stylex.props(styles.runs)}>
              {item.runs.map((run) => (
                <Link key={run.id} to={`/${run.id}`} {...stylex.props(styles.run)}>
                  {ago(run.createdAt, now)}
                </Link>
              ))}
            </div>
          </section>
        ),
      )}
    </main>
  )
}

export function ErrorBoundary(): ReactNode {
  return <p {...stylex.props(styles.back)}>Could not load evals</p>
}
