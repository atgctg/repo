import type { ReactNode } from 'react'
import { Button } from '@base-ui/react/button'
import { ScrollArea } from '@base-ui/react/scroll-area'
import { Separator } from '@base-ui/react/separator'
import { NavLink, useParams } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import { ago } from '~/lib/time'
import { forkWorld, useEvals, useNow, useStoryList, useWorlds } from '~/lib/store'
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
    gap: '1rem',
    padding: '0.75rem 0.5rem 1.5rem',
  },
  label: {
    fontSize: tokens.textXs,
    color: tokens.muted,
    padding: '0.25rem 0.75rem',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
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

export function Sidebar({ onFork }: { onFork: (id: string) => void }): ReactNode {
  const worlds = useWorlds()
  const stories = useStoryList()
  const evals = useEvals()
  const now = useNow()
  const params = useParams()
  return (
    <ScrollArea.Root {...stylex.props(styles.root)}>
      <ScrollArea.Viewport {...stylex.props(styles.viewport)}>
        <ScrollArea.Content {...stylex.props(styles.content)}>
          <section {...stylex.props(styles.list)}>
            <p {...stylex.props(styles.label)}>Stories</p>
            {stories.length === 0 ? (
              <p {...stylex.props(styles.label)}>None yet</p>
            ) : null}
            {stories.map((story) => (
              <NavLink
                key={story.id}
                to={`/${story.id}`}
                {...stylex.props(styles.row, params.id === story.id && styles.active)}
              >
                <span {...stylex.props(styles.name)}>{story.title}</span>
              </NavLink>
            ))}
          </section>
          <Separator {...stylex.props(styles.rule)} />
          <section {...stylex.props(styles.list)}>
            <p {...stylex.props(styles.label)}>Worlds</p>
            {worlds.map((world) => (
              <Button
                key={world.id}
                type="button"
                {...stylex.props(styles.row)}
                onClick={() => {
                  const id = forkWorld(world.id)
                  if (id) onFork(id)
                }}
              >
                <span {...stylex.props(styles.name)}>{world.title}</span>
              </Button>
            ))}
          </section>
          {import.meta.env.DEV && evals.length > 0 ? (
            <>
              <Separator {...stylex.props(styles.rule)} />
              <section {...stylex.props(styles.list)}>
                <p {...stylex.props(styles.label)}>Evals</p>
                {evals.map((run) => (
                  <div key={run.id} {...stylex.props(styles.row)}>
                    <span {...stylex.props(styles.name)}>{run.name}</span>
                    <span {...stylex.props(styles.meta)}>{ago(run.createdAt, now)}</span>
                  </div>
                ))}
              </section>
            </>
          ) : null}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
    </ScrollArea.Root>
  )
}
