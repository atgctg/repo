import type { ReactNode } from 'react'
import { ScrollArea } from '@base-ui/react/scroll-area'
import { NavLink, useParams } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import type { StorySummary } from 'shared'
import { ago } from '~/lib/time'
import { useNow, useStoryList, useWorlds } from '~/lib/store'
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
    gap: '0.15rem',
    padding: '0.5rem 0.4rem 1.5rem',
  },
  empty: {
    padding: '0.55rem 0.65rem',
    color: tokens.muted,
    fontSize: tokens.textSm,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    width: '100%',
    textAlign: 'left',
    padding: '0.4rem 0.45rem',
    borderRadius: '0.7rem',
    color: tokens.text,
    fontSize: tokens.textSm,
    backgroundColor: 'transparent',
    ':hover': {
      backgroundColor: tokens.chip,
    },
  },
  active: {
    backgroundColor: tokens.chip,
  },
  avatar: {
    width: '2.25rem',
    height: '2.25rem',
    borderRadius: tokens.radiusPill,
    overflow: 'hidden',
    flex: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.chip,
    color: tokens.muted,
    fontSize: tokens.textXs,
    fontWeight: 600,
  },
  photo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  text: {
    minWidth: 0,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  time: {
    flex: 'none',
    color: tokens.muted,
    fontSize: tokens.textXs,
  },
  evals: {
    marginTop: '0.75rem',
    padding: '0.45rem 0.65rem',
    color: tokens.muted,
    fontSize: tokens.textSm,
  },
})

function HistoryRow({
  story,
  active,
}: {
  story: StorySummary
  active: boolean
}): ReactNode {
  const worlds = useWorlds()
  const now = useNow()
  const cover = worlds.find((world) => world.id === story.world)?.cover
  const letter = [...(story.preview || story.world)][0]?.toLocaleUpperCase() ?? ''
  return (
    <NavLink to={`/${story.id}`} {...stylex.props(styles.row, active && styles.active)}>
      <span {...stylex.props(styles.avatar)}>
        {cover ? <img src={cover} alt="" {...stylex.props(styles.photo)} /> : letter}
      </span>
      <span {...stylex.props(styles.text)}>{story.preview}</span>
      <span {...stylex.props(styles.time)}>{ago(Date.parse(story.updatedAt), now)}</span>
    </NavLink>
  )
}

export function Sidebar(): ReactNode {
  const stories = useStoryList().filter((story) => import.meta.env.DEV || !story.case)
  const params = useParams()
  return (
    <ScrollArea.Root {...stylex.props(styles.root)}>
      <ScrollArea.Viewport {...stylex.props(styles.viewport)}>
        <ScrollArea.Content {...stylex.props(styles.content)}>
          {stories.length === 0 ? (
            <p {...stylex.props(styles.empty)}>No stories yet</p>
          ) : (
            stories.map((story) => (
              <HistoryRow key={story.id} story={story} active={params.id === story.id} />
            ))
          )}
          {import.meta.env.DEV ? (
            <NavLink to="/evals" {...stylex.props(styles.evals)}>
              Evals
            </NavLink>
          ) : null}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
    </ScrollArea.Root>
  )
}
