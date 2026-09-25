import type { ReactNode } from 'react'
import { Button } from '@base-ui/react/button'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import type { Story } from 'shared'
import { Composer } from './composer'
import { SceneDrawer } from './drawer'
import { Icon } from './icons'
import { Log } from './log'
import { closeDrawer, useStoryUi } from '~/lib/store'
import { tokens } from '~/styles/tokens.stylex'
import { ui } from '~/styles/ui'

const styles = stylex.create({
  shell: {
    display: 'grid',
    height: '100dvh',
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: tokens.bg,
    gridTemplateColumns: '20rem minmax(0, 1fr)',
    gridTemplateRows: 'auto minmax(0, 1fr)',
  },
  drawer: {
    gridTemplateColumns: '20rem minmax(0, 1fr) minmax(17.5rem, 22.5rem)',
  },
  header: {
    gridColumn: '1',
    gridRow: '1',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    minWidth: 0,
    margin: 0,
    padding: '0.75rem 0.25rem 0.25rem',
  },
  title: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: tokens.textMd,
    fontWeight: 500,
    lineHeight: 1.5,
  },
  count: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    flex: 'none',
    color: tokens.muted,
    fontSize: tokens.textSm,
    lineHeight: 1.5,
  },
  cards: {
    marginLeft: 'auto',
  },
  albums: {
    transform: 'rotate(90deg)',
  },
  chat: {
    gridColumn: '1',
    gridRow: '2',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
  },
  dock: {
    position: 'absolute',
    left: '0.75rem',
    right: '0.75rem',
    bottom: '1rem',
    zIndex: 2,
  },
  main: {
    gridColumn: '2',
    gridRow: '1 / -1',
    minWidth: 0,
    minHeight: 0,
  },
  sceneDrawer: {
    gridColumn: '3',
    gridRow: '1 / -1',
    minWidth: 0,
    minHeight: 0,
  },
})

export function Studio({ story }: { story: Story }): ReactNode {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const onCards = pathname.endsWith('/cards')
  const onRaw = pathname.endsWith('/raw')
  const uiState = useStoryUi(story.id)
  const scene =
    onCards || onRaw || uiState.openScene === undefined
      ? undefined
      : story.scenes[uiState.openScene]
  function show(path: string): void {
    closeDrawer(story.id)
    void navigate(path)
  }
  return (
    <div {...stylex.props(styles.shell, scene && styles.drawer)}>
      <header {...stylex.props(styles.header)}>
        <Link to="/" aria-label="Worlds" {...stylex.props(ui.iconButton)}>
          <Icon name="back" />
        </Link>
        <h1 {...stylex.props(styles.title)}>{story.title}</h1>
        <span {...stylex.props(styles.count)}>
          <Icon name="image" />
          <span>{story.scenes.length}</span>
        </span>
        <Button
          type="button"
          aria-pressed={onCards}
          {...stylex.props(ui.ghost, styles.cards, onCards && ui.ghostOn)}
          onClick={() => show(onCards ? `/${story.id}` : `/${story.id}/cards`)}
        >
          <span {...stylex.props(styles.albums)}>
            <Icon name="albums" />
          </span>
          <span>{story.cards.length}</span>
        </Button>
        <Button
          type="button"
          aria-pressed={onRaw}
          {...stylex.props(ui.ghost, onRaw && ui.ghostOn)}
          onClick={() => show(onRaw ? `/${story.id}` : `/${story.id}/raw`)}
        >
          Raw
        </Button>
      </header>
      <div {...stylex.props(styles.chat)}>
        <Log story={story} />
        <div {...stylex.props(styles.dock)}>
          <Composer storyId={story.id} />
        </div>
      </div>
      <div {...stylex.props(styles.main)}>
        <Outlet />
      </div>
      {scene ? (
        <div {...stylex.props(styles.sceneDrawer)}>
          <SceneDrawer story={story} scene={scene} />
        </div>
      ) : null}
    </div>
  )
}
