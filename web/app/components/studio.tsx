import type { ReactNode } from 'react'
import { Button } from '@base-ui/react/button'
import { useNavigate } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import type { Story } from 'shared'
import { Composer } from './composer'
import { SceneDrawer } from './drawer'
import { CardGrid, SceneGrid } from './grid'
import { Log } from './log'
import { Sidebar } from './sidebar'
import { toggleCards, useStoryUi } from '~/lib/store'
import { tokens } from '~/styles/tokens.stylex'
import { ui } from '~/styles/ui'

const styles = stylex.create({
  shell: {
    display: 'grid',
    height: '100dvh',
    minHeight: 0,
    backgroundColor: tokens.bg,
    gridTemplateColumns: '14rem 20rem minmax(0, 1fr)',
  },
  drawer: {
    gridTemplateColumns: '14rem 20rem minmax(0, 1fr) minmax(17.5rem, 22.5rem)',
  },
  chat: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem 0.25rem',
  },
  title: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: tokens.textSm,
    fontWeight: 600,
  },
  grow: {
    flex: 1,
    minHeight: 0,
  },
  pad: {
    padding: '0.5rem 0.75rem 0.75rem',
  },
  main: {
    minWidth: 0,
    minHeight: 0,
  },
})

export function Studio({ story }: { story: Story }): ReactNode {
  const navigate = useNavigate()
  const uiState = useStoryUi(story.id)
  const scene =
    uiState.openScene === undefined ? undefined : story.scenes[uiState.openScene]
  return (
    <div {...stylex.props(styles.shell, scene && styles.drawer)}>
      <Sidebar onFork={(id) => void navigate(`/${id}`)} />
      <div {...stylex.props(styles.chat)}>
        <header {...stylex.props(styles.header)}>
          <h1 {...stylex.props(styles.title)}>{story.title}</h1>
          <span {...stylex.props(ui.muted)}>
            {story.scenes.length} {story.scenes.length === 1 ? 'scene' : 'scenes'}
          </span>
          <span {...stylex.props(ui.muted)}>
            {story.cards.length} {story.cards.length === 1 ? 'card' : 'cards'}
          </span>
          <Button
            type="button"
            {...stylex.props(ui.ghost, uiState.cards && ui.ghostOn)}
            onClick={() => toggleCards(story.id)}
          >
            Cards
          </Button>
        </header>
        <div {...stylex.props(styles.grow)}>
          <Log story={story} />
        </div>
        <div {...stylex.props(styles.pad)}>
          <Composer storyId={story.id} variant="dock" />
        </div>
      </div>
      <div {...stylex.props(styles.main)}>
        {uiState.cards ? <CardGrid story={story} /> : <SceneGrid story={story} />}
      </div>
      {scene ? <SceneDrawer story={story} scene={scene} /> : null}
    </div>
  )
}
