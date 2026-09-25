import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import { HomeSections } from '~/components/grid'
import { ResizeEdge, usePaneWidth } from '~/components/resize'
import { Sidebar } from '~/components/sidebar'
import { ensureIndex, forkWorld, useWorlds } from '~/lib/store'
import { tokens } from '~/styles/tokens.stylex'
import { ui } from '~/styles/ui'

const styles = stylex.create({
  studio: {
    position: 'relative',
    display: 'grid',
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
  const worlds = useWorlds()
  const navigate = useNavigate()
  const sidebar = usePaneWidth('pane.sidebar', 224, 160, 420)
  const studio = stylex.props(styles.studio)
  return (
    <>
      <title>Verse</title>
      <div
        {...studio}
        style={{
          ...studio.style,
          gridTemplateColumns: `${sidebar.width}px minmax(0, 1fr)`,
        }}
      >
        <ResizeEdge
          side="left"
          width={sidebar.width}
          sign={1}
          min={160}
          max={420}
          onWidth={sidebar.setWidth}
          onCommit={sidebar.commit}
        />
        <Sidebar />
        <HomeSections
          stories={[]}
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
      </div>
    </>
  )
}

export function ErrorBoundary(): ReactNode {
  return <p {...stylex.props(ui.muted, styles.note)}>Could not load worlds</p>
}
