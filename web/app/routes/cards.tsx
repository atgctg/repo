import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { CardGrid } from '~/components/grid'
import { useStory } from '~/lib/store'

export default function CardsRoute(): ReactNode {
  const story = useStory(useParams().id ?? '')
  if (!story) return null
  return <CardGrid story={story} />
}
