import { useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, data } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import { ReviewCard, ReviewKeys, ReviewPage } from '~/components/review-card'
import { fetchEvalCard, writeVerdict, type EvalCard, type EvalVerdict } from '~/lib/api'
import { tokens } from '~/styles/tokens.stylex'
import type { Route } from './+types/eval-run'

const styles = stylex.create({
  back: {
    width: 'min(42rem, 100%)',
    margin: '0 auto 1rem',
    color: tokens.muted,
    fontSize: tokens.textSm,
  },
})

export async function clientLoader({
  params,
}: Route.ClientLoaderArgs): Promise<EvalCard> {
  const id = params.id
  if (!id) throw data(null, { status: 404 })
  const card = await fetchEvalCard(id)
  if (!card) throw data(null, { status: 404 })
  return card
}

clientLoader.hydrate = true as const

export function HydrateFallback(): ReactNode {
  return (
    <ReviewPage>
      <p {...stylex.props(styles.back)}>Loading</p>
    </ReviewPage>
  )
}

function Run({ card }: { card: EvalCard }): ReactNode {
  const navigate = useNavigate()
  const [verdict, setVerdict] = useState(card.verdict)
  const [past, setPast] = useState<EvalVerdict | null | undefined>(undefined)
  const desired = useRef(new Map<string, EvalVerdict | null>())

  function judge(next: EvalVerdict): void {
    const prev = verdict
    setPast(prev)
    setVerdict(next)
    desired.current.set(card.id, next)
    void writeVerdict(card.id, next).catch(() => {
      if (desired.current.get(card.id) !== next) return
      setVerdict(prev)
      setPast(undefined)
    })
  }

  function undo(): void {
    if (past === undefined) return
    const next = past
    setVerdict(next)
    setPast(undefined)
    desired.current.set(card.id, next)
    void writeVerdict(card.id, next)
  }

  return (
    <ReviewPage>
      <ReviewKeys
        onPass={() => judge('pass')}
        onFail={() => judge('fail')}
        onUndo={undo}
      />
      <Link to="/evals" {...stylex.props(styles.back)}>
        Queue
      </Link>
      <ReviewCard
        key={card.id}
        card={{ ...card, verdict }}
        onSkip={() => void navigate('/evals')}
      />
    </ReviewPage>
  )
}

export default function EvalRunRoute({ loaderData }: Route.ComponentProps): ReactNode {
  return <Run card={loaderData} />
}

export function ErrorBoundary(): ReactNode {
  return (
    <ReviewPage>
      <p {...stylex.props(styles.back)}>Not found</p>
    </ReviewPage>
  )
}
