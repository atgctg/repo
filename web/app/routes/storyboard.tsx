import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { Storyboard } from '~/components/grid'
import { useStory } from '~/lib/store'

export default function StoryboardRoute(): ReactNode {
  const story = useStory(useParams().id ?? '')
  if (!story) return null
  return <Storyboard story={story} />
}
