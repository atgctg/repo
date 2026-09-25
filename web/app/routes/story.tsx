import type { ReactNode } from 'react'
import { data, useParams } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import { Studio } from '~/components/studio'
import { prefetchIndex, ensureStory, useStory } from '~/lib/store'
import { ui } from '~/styles/ui'
import type { Route } from './+types/story'

const styles = stylex.create({
  note: {
    padding: '2rem',
  },
})

export async function clientLoader({ params }: Route.ClientLoaderArgs): Promise<null> {
  const id = params.id
  if (!id) throw data(null, { status: 404 })
  prefetchIndex()
  if (!(await ensureStory(id))) throw data(null, { status: 404 })
  return null
}

clientLoader.hydrate = true as const

export function HydrateFallback(): ReactNode {
  return <p {...stylex.props(ui.muted, styles.note)}>Loading</p>
}

export default function StoryRoute(): ReactNode {
  const { id } = useParams()
  const story = useStory(id ?? '')
  if (!story) {
    return <p {...stylex.props(ui.muted, styles.note)}>Not found</p>
  }
  return (
    <>
      <title>{story.title}</title>
      <Studio story={story} />
    </>
  )
}

export function ErrorBoundary(): ReactNode {
  return <p {...stylex.props(ui.muted, styles.note)}>Not found</p>
}
