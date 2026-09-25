import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { SceneGrid } from '~/components/grid'
import { useStory } from '~/lib/store'

export default function ScenesRoute(): ReactNode {
  const story = useStory(useParams().id ?? '')
  if (!story) return null
  return <SceneGrid story={story} />
}
