import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import { HomeSections } from '~/components/grid'
import { Sidebar } from '~/components/sidebar'
import { ensureIndex, forkWorld, useLayout, useStoryList, useWorlds } from '~/lib/store'
import { tokens } from '~/styles/tokens.stylex'
import { ui } from '~/styles/ui'
const styles = stylex.create({
  studio: {
    display: 'grid',
    gridTemplateColumns: '14rem minmax(0, 1fr)',
    height: '100dvh',
    minHeight: 0,
    backgroundColor: tokens.bg,
  },
  note: {
    padding: '2rem',
  },
})

export async function clientLoader(): Promise<null> {
  await ensureIndex()
  return null
}

clientLoader.hydrate = true as const

export function HydrateFallback(): ReactNode {
  return <p {...stylex.props(ui.muted, styles.note)}>Loading</p>
}

export default function Home(): ReactNode {
  const layout = useLayout()
  const worlds = useWorlds()
  const stories = useStoryList()
  const navigate = useNavigate()
  const sections = (
    <HomeSections
      stories={
        layout === 'fullscreen'
          ? stories.map((story) => ({
              id: story.id,
              title: story.title,
              image: story.cover,
            }))
          : []
      }
      worlds={worlds.map((world) => ({
        id: world.id,
        title: world.title,
        image: world.cover,
      }))}
      onOpenStory={(id) => void navigate(`/${id}`)}
      onOpenWorld={(id) => {
        const storyId = forkWorld(id)
        if (storyId) void navigate(`/${storyId}`)
      }}
    />
  )
  if (layout === 'fullscreen') return sections
  return (
    <div {...stylex.props(styles.studio)}>
      <Sidebar onFork={(id) => void navigate(`/${id}`)} />
      {sections}
    </div>
  )
}

export function ErrorBoundary(): ReactNode {
  return <p {...stylex.props(ui.muted, styles.note)}>Could not load worlds</p>
}
