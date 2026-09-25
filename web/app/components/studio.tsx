import type { ReactNode } from 'react'
import { Button } from '@base-ui/react/button'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import type { Story } from 'shared'
import { Composer } from './composer'
import { EvalBar, EvalFocus, EvalNote, PreloadNext } from './eval-bar'
import { ResizeEdge, usePaneWidth } from './resize'
import { SceneDrawer } from './drawer'
import { Icon } from './icons'
import { Log } from './log'
import { closeDrawer, useStoryList, useStoryUi } from '~/lib/store'
import { tokens } from '~/styles/tokens.stylex'
import { ui } from '~/styles/ui'

const styles = stylex.create({
  shell: {
    display: 'grid',
    height: '100dvh',
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: tokens.bg,
    gridTemplateRows: 'auto minmax(0, 1fr)',
  },
  header: {
    gridColumn: '1',
    gridRow: '1',
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    minWidth: 0,
    margin: 0,
    padding: '0.75rem 0.75rem 0.25rem',
  },
  title: {
    flex: '1 1 auto',
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
    gap: '0.15rem',
    flex: 'none',
    color: tokens.muted,
    fontSize: tokens.textSm,
    lineHeight: 1,
  },
  tool: {
    flex: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.2rem',
    padding: '0.4rem 0.7rem',
    borderRadius: tokens.radiusPill,
    color: tokens.muted,
    backgroundColor: 'transparent',
    fontSize: tokens.textSm,
    lineHeight: 1,
    ':hover': {
      backgroundColor: tokens.chip,
    },
  },
  toolOn: {
    color: tokens.accent,
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
    overflow: 'hidden',
  },
  dock: {
    position: 'absolute',
    left: '0.75rem',
    right: '0.75rem',
    bottom: '1rem',
    zIndex: 2,
  },
  main: {
    position: 'relative',
    gridColumn: '2',
    gridRow: '1 / -1',
    minWidth: 0,
    minHeight: 0,
  },
  sceneDrawer: {
    position: 'relative',
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
  const caseName = useStoryList().find((item) => item.id === story.id)?.case
  const showNote = Boolean(caseName) && !onCards && !onRaw
  const uiState = useStoryUi(story.id)
  const scene =
    showNote || onCards || onRaw || uiState.openScene === undefined
      ? undefined
      : story.scenes[uiState.openScene]
  const chat = usePaneWidth('pane.chat', 260, 220, 560)
  const drawer = usePaneWidth('pane.drawer', 320, 240, 520)
  function show(path: string): void {
    closeDrawer(story.id)
    void navigate(path)
  }
  const shell = stylex.props(styles.shell)
  return (
    <div
      {...shell}
      style={{
        ...shell.style,
        gridTemplateColumns:
          scene || showNote
            ? `${chat.width}px minmax(0, 1fr) ${drawer.width}px`
            : `${chat.width}px minmax(0, 1fr)`,
      }}
    >
      <ResizeEdge
        side="left"
        width={chat.width}
        sign={1}
        min={220}
        max={560}
        onWidth={chat.setWidth}
        onCommit={chat.commit}
      />
      <header {...stylex.props(styles.header)}>
        <Link to="/" aria-label="Worlds" {...stylex.props(ui.iconButton)}>
          <Icon name="back" />
        </Link>
        <h1 {...stylex.props(styles.title)}>{story.title}</h1>
        <span {...stylex.props(styles.count)}>{story.scenes.length}</span>
        <Button
          type="button"
          aria-pressed={onCards}
          {...stylex.props(styles.tool, onCards && styles.toolOn)}
          onClick={() => show(onCards ? `/${story.id}` : `/${story.id}/cards`)}
        >
          <span {...stylex.props(styles.albums)}>
            <Icon name="albums" size="lg" />
          </span>
          <span>{story.cards.length}</span>
        </Button>
        <Button
          type="button"
          aria-pressed={onRaw}
          {...stylex.props(styles.tool, onRaw && styles.toolOn)}
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
        {caseName ? (
          <>
            <EvalFocus key={story.id} story={story} />
            <PreloadNext storyId={story.id} />
            <EvalBar storyId={story.id} />
          </>
        ) : null}
      </div>
      {showNote && caseName ? (
        <div {...stylex.props(styles.sceneDrawer)}>
          <ResizeEdge
            side="right"
            width={drawer.width}
            sign={-1}
            min={240}
            max={520}
            onWidth={drawer.setWidth}
            onCommit={drawer.commit}
          />
          <EvalNote storyId={story.id} caseName={caseName} />
        </div>
      ) : null}
      {scene ? (
        <div {...stylex.props(styles.sceneDrawer)}>
          <ResizeEdge
            side="right"
            width={drawer.width}
            sign={-1}
            min={240}
            max={520}
            onWidth={drawer.setWidth}
            onCommit={drawer.commit}
          />
          <SceneDrawer story={story} scene={scene} />
        </div>
      ) : null}
    </div>
  )
}
