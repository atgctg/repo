import { useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { statusText } from '~/lib/time'
import { clearSelection, sendTurn, useActivity, useNow, useStoryUi } from '~/lib/store'
import { tokens } from '~/styles/tokens.stylex'
import { ui } from '~/styles/ui'
import { Icon } from './icons'

const styles = stylex.create({
  wrap: {
    position: 'relative',
  },
  status: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    flex: 'none',
    maxWidth: '14rem',
    color: tokens.muted,
    fontSize: tokens.textXs,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  error: {
    color: tokens.danger,
  },
  dot: {
    width: '0.45rem',
    height: '0.45rem',
    borderRadius: tokens.radiusPill,
    backgroundColor: tokens.accent,
    animationName: stylex.keyframes({
      '50%': { opacity: 0.35 },
    }),
    animationDuration: '1.2s',
    animationIterationCount: 'infinite',
  },
  count: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.2rem',
    flex: 'none',
    borderRadius: tokens.radiusPill,
    padding: '0.1rem 0.4rem 0.1rem 0.15rem',
    color: tokens.accent,
    fontSize: tokens.textSm,
    lineHeight: 1,
    ':hover': {
      backgroundColor: tokens.accent,
      color: tokens.bg,
    },
  },
  mark: {
    width: '1.25rem',
    height: '1.25rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none',
    padding: 0,
    color: 'inherit',
    fontSize: '1.15rem',
    lineHeight: 1,
  },
  clip: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
})

export function Composer({ storyId }: { storyId: string }): ReactNode {
  const [draft, setDraft] = useState('')
  const activity = useActivity(storyId)
  const now = useNow()
  const [chip, setChip] = useState(false)
  const selected = useStoryUi(storyId).selected
  const label = statusText(activity, now)
  const live = Boolean(
    activity.turnStartedAt || (activity.phase && activity.phaseMs === undefined),
  )

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (live) return
    const text = draft.trim()
    if (!text) return
    const previous = draft
    setDraft('')
    void sendTurn(storyId, text, undefined, selected).then((ok) => {
      if (!ok) setDraft(previous)
    })
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <form {...stylex.props(styles.wrap)} onSubmit={onSubmit}>
      <div {...stylex.props(ui.pillow)}>
        <textarea
          data-composer=""
          rows={1}
          value={draft}
          placeholder="Message..."
          autoComplete="off"
          {...stylex.props(ui.field)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {selected.length > 0 ? (
          <span
            {...stylex.props(styles.count)}
            onMouseEnter={() => setChip(true)}
            onMouseLeave={() => setChip(false)}
          >
            {chip ? (
              <button
                type="button"
                aria-label="Clear selection"
                {...stylex.props(styles.mark)}
                onClick={() => clearSelection(storyId)}
              >
                ×
              </button>
            ) : (
              <span {...stylex.props(styles.mark)}>
                <Icon name="pointer" size="md" />
              </span>
            )}
            <span>{selected.length}</span>
          </span>
        ) : null}
        {label ? (
          <span
            aria-live="polite"
            {...stylex.props(styles.status, !live && styles.error)}
          >
            {live ? <i {...stylex.props(styles.dot)} /> : null}
            <span {...stylex.props(styles.clip)}>{label}</span>
          </span>
        ) : null}
      </div>
    </form>
  )
}
