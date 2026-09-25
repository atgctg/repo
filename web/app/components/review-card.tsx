import { useRef, useState, type ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { useMountEffect } from '~/hooks/use-mount-effect'
import type { EvalCard } from '~/lib/api'
import { tokens } from '~/styles/tokens.stylex'
import { ui } from '~/styles/ui'

const styles = stylex.create({
  page: {
    minHeight: '100dvh',
    boxSizing: 'border-box',
    padding: '1.25rem 1.25rem 3rem',
    backgroundColor: tokens.bg,
    color: tokens.text,
  },
  frame: {
    width: 'min(42rem, 100%)',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  top: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  name: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: tokens.muted,
    fontSize: tokens.textSm,
    fontWeight: 600,
  },
  skip: {
    marginLeft: 'auto',
  },
  rule: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: tokens.textMd,
    fontWeight: 600,
    lineHeight: 1.4,
  },
  prompt: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontSize: tokens.textMd,
    lineHeight: 1.45,
  },
  output: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  line: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontSize: tokens.textSm,
    lineHeight: 1.45,
  },
  expect: {
    margin: 0,
    color: tokens.muted,
    fontSize: tokens.textXs,
    lineHeight: 1.45,
  },
  context: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
    maxHeight: '16rem',
    overflow: 'auto',
    padding: '0.15rem 0 0.15rem 0.15rem',
    color: tokens.muted,
  },
  keys: {
    color: tokens.muted,
    fontSize: tokens.textXs,
  },
  verdict: {
    flex: 'none',
    color: tokens.muted,
    fontSize: tokens.textXs,
    fontWeight: 600,
  },
  board: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.45rem',
  },
  score: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.75rem',
    fontSize: tokens.textSm,
  },
  scoreName: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  scoreCount: {
    marginLeft: 'auto',
    flex: 'none',
    color: tokens.muted,
  },
})

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function ReviewKeys({
  onPass,
  onFail,
  onUndo,
}: {
  onPass: () => void
  onFail: () => void
  onUndo: () => void
}): null {
  const actions = useRef({ onPass, onFail, onUndo })
  actions.current = { onPass, onFail, onUndo }
  useMountEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.repeat) return
      if (isTyping(event.target)) return
      if (
        event.metaKey &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        event.key.toLowerCase() === 'z'
      ) {
        event.preventDefault()
        actions.current.onUndo()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault()
        actions.current.onPass()
        return
      }
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        actions.current.onFail()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
  return null
}

export function ReviewCard({
  card,
  onSkip,
}: {
  card: EvalCard
  onSkip: () => void
}): ReactNode {
  const [open, setOpen] = useState(false)
  return (
    <article {...stylex.props(styles.frame)}>
      <div {...stylex.props(styles.top)}>
        <h1 {...stylex.props(styles.name)}>{card.caseName}</h1>
        {card.verdict ? (
          <span {...stylex.props(styles.verdict)}>
            {card.verdict === 'pass' ? 'Pass' : 'Fail'}
          </span>
        ) : null}
        <button type="button" {...stylex.props(ui.ghost, styles.skip)} onClick={onSkip}>
          Skip
        </button>
      </div>
      {card.rule ? (
        <p {...stylex.props(styles.rule)} title={card.rule}>
          {card.rule}
        </p>
      ) : null}
      {card.context.length > 0 ? (
        <div>
          <button
            type="button"
            {...stylex.props(ui.ghost)}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? 'Hide earlier context' : 'Earlier context'}
          </button>
          {open ? (
            <div {...stylex.props(styles.context)}>
              {card.context.map((line, index) => (
                <p key={index} {...stylex.props(styles.line)}>
                  {line}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {card.prompt ? <p {...stylex.props(styles.prompt)}>{card.prompt}</p> : null}
      <div {...stylex.props(styles.output)}>
        {card.output.length > 0 ? (
          card.output.map((line, index) => (
            <p key={index} {...stylex.props(styles.line)}>
              {line}
            </p>
          ))
        ) : (
          <p {...stylex.props(styles.expect)}>No output</p>
        )}
      </div>
      {card.expect ? <p {...stylex.props(styles.expect)}>{card.expect}</p> : null}
      <p {...stylex.props(styles.keys)}>P pass · F fail · ⌘Z undo</p>
    </article>
  )
}

export function ReviewScoreboard({
  counts,
}: {
  counts: { name: string; pass: number; fail: number }[]
}): ReactNode {
  return (
    <div {...stylex.props(styles.board)}>
      {counts.map((item) => (
        <p key={item.name} {...stylex.props(styles.score)}>
          <span {...stylex.props(styles.scoreName)}>{item.name}</span>
          <span {...stylex.props(styles.scoreCount)}>
            {item.pass} pass · {item.fail} fail
          </span>
        </p>
      ))}
    </div>
  )
}

export function ReviewPage({ children }: { children: ReactNode }): ReactNode {
  return <main {...stylex.props(styles.page)}>{children}</main>
}
