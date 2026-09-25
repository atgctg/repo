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
    maxWidth: '100%',
    overflow: 'hidden',
    backgroundColor: tokens.bg,
  },
  viewport: {
    height: '100%',
    width: '100%',
    maxWidth: '100%',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
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
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
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
    width: '1.75rem',
    height: '1.75rem',
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
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  time: {
    flex: 'none',
    marginLeft: 'auto',
    color: tokens.muted,
    fontSize: tokens.textXs,
  },
  label: {
    marginTop: '0.85rem',
    padding: '0.35rem 0.65rem 0.15rem',
    color: tokens.muted,
    fontSize: tokens.textXs,
    fontWeight: 600,
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
  const listed = useStoryList()
  const stories = listed.filter((story) => !story.case)
  const evals = listed.filter((story) => story.case)
  const params = useParams()
  return (
    <ScrollArea.Root {...stylex.props(styles.root)}>
      <ScrollArea.Viewport {...stylex.props(styles.viewport)}>
        <ScrollArea.Content
          {...stylex.props(styles.content)}
          style={{ minWidth: 0, width: '100%' }}
        >
          {stories.length === 0 ? (
            <p {...stylex.props(styles.empty)}>No stories yet</p>
          ) : (
            stories.map((story) => (
              <HistoryRow key={story.id} story={story} active={params.id === story.id} />
            ))
          )}
          {import.meta.env.DEV ? (
            <>
              <p {...stylex.props(styles.label)}>Evals</p>
              {evals.length === 0 ? (
                <p {...stylex.props(styles.empty)}>No eval runs</p>
              ) : (
                evals.map((story) => (
                  <HistoryRow
                    key={story.id}
                    story={story}
                    active={params.id === story.id}
                  />
                ))
              )}
            </>
          ) : null}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
    </ScrollArea.Root>
  )
}
