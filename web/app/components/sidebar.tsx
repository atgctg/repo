import type { ReactNode } from 'react'
import { ScrollArea } from '@base-ui/react/scroll-area'
import { Separator } from '@base-ui/react/separator'
import { NavLink, useParams } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import { ago } from '~/lib/time'
import { useEvals, useNow, useStoryList } from '~/lib/store'
import { tokens } from '~/styles/tokens.stylex'

const styles = stylex.create({
  root: {
    height: '100%',
    minHeight: 0,
    minWidth: 0,
    backgroundColor: tokens.bg,
  },
  viewport: {
    height: '100%',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '0.75rem 0.5rem 1.5rem',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  empty: {
    padding: '0.45rem 0.75rem',
    color: tokens.muted,
    fontSize: tokens.textSm,
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.5rem',
    width: '100%',
    textAlign: 'left',
    padding: '0.45rem 0.75rem',
    borderRadius: tokens.radiusPill,
    color: tokens.text,
    fontSize: tokens.textSm,
    backgroundColor: 'transparent',
    ':hover': {
      backgroundColor: tokens.chip,
    },
  },
  active: {
    color: tokens.accent,
  },
  name: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  meta: {
    marginLeft: 'auto',
    flex: 'none',
    color: tokens.muted,
    fontSize: tokens.textXs,
  },
  rule: {
    height: '1px',
    backgroundColor: tokens.chip,
    border: 'none',
  },
})

export function Sidebar(): ReactNode {
  const stories = useStoryList()
  const evals = useEvals()
  const now = useNow()
  const params = useParams()
  return (
    <ScrollArea.Root {...stylex.props(styles.root)}>
      <ScrollArea.Viewport {...stylex.props(styles.viewport)}>
        <ScrollArea.Content {...stylex.props(styles.content)}>
          <section {...stylex.props(styles.list)}>
            {stories.length === 0 ? (
              <p {...stylex.props(styles.empty)}>No stories yet</p>
            ) : (
              stories.map((story) => (
                <NavLink
                  key={story.id}
                  to={`/${story.id}`}
                  {...stylex.props(styles.row, params.id === story.id && styles.active)}
                >
                  <span {...stylex.props(styles.name)}>{story.title}</span>
                </NavLink>
              ))
            )}
          </section>
          {import.meta.env.DEV && evals.length > 0 ? (
            <>
              <Separator {...stylex.props(styles.rule)} />
              <section {...stylex.props(styles.list)}>
                {evals.map((run) => (
                  <NavLink
                    key={run.id}
                    to={`/evals/${run.id}`}
                    {...stylex.props(styles.row, params.id === run.id && styles.active)}
                  >
                    <span {...stylex.props(styles.name)}>{run.name}</span>
                    <span {...stylex.props(styles.meta)}>{ago(run.createdAt, now)}</span>
                  </NavLink>
                ))}
              </section>
            </>
          ) : null}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
    </ScrollArea.Root>
  )
}
