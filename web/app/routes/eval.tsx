import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import {
  ReviewCard,
  ReviewKeys,
  ReviewPage,
  ReviewScoreboard,
} from '~/components/review-card'
import {
  fetchEvalReview,
  writeVerdict,
  type EvalCard,
  type EvalCount,
  type EvalReview,
  type EvalVerdict,
} from '~/lib/api'
import { tokens } from '~/styles/tokens.stylex'
import type { Route } from './+types/eval'

const styles = stylex.create({
  back: {
    width: 'min(42rem, 100%)',
    margin: '0 auto 1rem',
    display: 'block',
    color: tokens.muted,
    fontSize: tokens.textSm,
  },
  board: {
    width: 'min(42rem, 100%)',
    margin: '0 auto',
  },
})

export async function clientLoader(): Promise<EvalReview> {
  return fetchEvalReview()
}

clientLoader.hydrate = true as const

export function HydrateFallback(): ReactNode {
  return (
    <ReviewPage>
      <p {...stylex.props(styles.back)}>Loading</p>
    </ReviewPage>
  )
}

function shiftCount(
  counts: EvalCount[],
  name: string,
  verdict: EvalVerdict,
  delta: 1 | -1,
): EvalCount[] {
  return counts.map((item) =>
    item.name === name
      ? { ...item, [verdict]: Math.max(0, item[verdict] + delta) }
      : item,
  )
}

function Queue({ review }: { review: EvalReview }): ReactNode {
  const [cards, setCards] = useState(review.cards)
  const [counts, setCounts] = useState(review.counts)
  const [history, setHistory] = useState<{ card: EvalCard; verdict: EvalVerdict }[]>([])
  const desired = useRef(new Map<string, EvalVerdict | null>())
  const current = cards[0]

  function judge(verdict: EvalVerdict): void {
    if (!current) return
    const card = current
    setCards((items) => items.filter((item) => item.id !== card.id))
    setCounts((items) => shiftCount(items, card.caseName, verdict, 1))
    setHistory((items) => [{ card, verdict }, ...items])
    desired.current.set(card.id, verdict)
    void writeVerdict(card.id, verdict).catch(() => {
      if (desired.current.get(card.id) !== verdict) return
      setCards((items) => [card, ...items.filter((item) => item.id !== card.id)])
      setCounts((items) => shiftCount(items, card.caseName, verdict, -1))
      setHistory((items) => items.filter((item) => item.card.id !== card.id))
    })
  }

  function skip(): void {
    setCards((items) => {
      if (items.length < 2) return items
      const [first, ...rest] = items
      return first ? [...rest, first] : items
    })
  }

  function undo(): void {
    const last = history[0]
    if (!last) return
    setHistory((items) => items.slice(1))
    setCards((items) => [last.card, ...items.filter((item) => item.id !== last.card.id)])
    setCounts((items) => shiftCount(items, last.card.caseName, last.verdict, -1))
    desired.current.set(last.card.id, null)
    void writeVerdict(last.card.id, null)
  }

  return (
    <ReviewPage>
      <ReviewKeys
        onPass={() => judge('pass')}
        onFail={() => judge('fail')}
        onUndo={undo}
      />
      <Link to="/" {...stylex.props(styles.back)}>
        Back
      </Link>
      {current ? (
        <ReviewCard key={current.id} card={current} onSkip={skip} />
      ) : (
        <div {...stylex.props(styles.board)}>
          <ReviewScoreboard counts={counts} />
        </div>
      )}
    </ReviewPage>
  )
}

export default function EvalRoute({ loaderData }: Route.ComponentProps): ReactNode {
  return <Queue review={loaderData} />
}

export function ErrorBoundary(): ReactNode {
  return (
    <ReviewPage>
      <p {...stylex.props(styles.back)}>Could not load evals</p>
    </ReviewPage>
  )
}
