import type { ReactNode } from 'react'
import { data, useParams } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import { Fullscreen } from '~/components/fullscreen'
import { Studio } from '~/components/studio'
import { useMountEffect } from '~/hooks/use-mount-effect'
import { ensureIndex, ensureStory, hasEntry, useLayout, useStory } from '~/lib/store'
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
  await Promise.all([ensureIndex(), hasEntry(id) ? Promise.resolve() : ensureStory(id)])
  if (!hasEntry(id)) throw data(null, { status: 404 })
  return null
}

clientLoader.hydrate = true as const

export function HydrateFallback(): ReactNode {
  return <p {...stylex.props(ui.muted, styles.note)}>Loading</p>
}

function Title({ title }: { title: string }): null {
  useMountEffect(() => {
    document.title = title
  })
  return null
}

export default function StoryRoute(): ReactNode {
  const { id } = useParams()
  const story = useStory(id ?? '')
  const layout = useLayout()
  if (!story) {
    return <p {...stylex.props(ui.muted, styles.note)}>Not found</p>
  }
  return (
    <>
      <Title key={`${story.id}:${story.title}`} title={story.title} />
      {layout === 'studio' ? <Studio story={story} /> : <Fullscreen story={story} />}
    </>
  )
}

export function ErrorBoundary(): ReactNode {
  return <p {...stylex.props(ui.muted, styles.note)}>Not found</p>
}
