import { useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import {
  clearSelection,
  messageOf,
  sendFeedback,
  sendTurn,
  stopTurn,
  useActivity,
  useStoryUi,
} from '~/lib/store'
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
    flex: 'none',
    maxWidth: '14rem',
    color: tokens.danger,
    fontSize: tokens.textXs,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  notice: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    padding: '0 1.25rem 0.375rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: tokens.danger,
    fontSize: tokens.textXs,
    lineHeight: 1.4,
  },
  saved: {
    color: tokens.muted,
  },
  stop: {
    alignSelf: 'center',
    width: '1.75rem',
    height: '1.75rem',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none',
    borderRadius: tokens.radiusPill,
    color: tokens.text,
    backgroundColor: 'transparent',
    ':hover': {
      backgroundColor: tokens.bg,
    },
  },
  tight: {
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.3625rem 1.25rem',
  },
  count: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.2rem',
    flex: 'none',
    boxSizing: 'border-box',
    height: '2.25rem',
    minWidth: '3.75rem',
    borderRadius: tokens.radiusPill,
    padding: '0 0.55rem',
    backgroundColor: 'color-mix(in srgb, #3b82f6 18%, #ffffff)',
    color: '#3b82f6',
    fontSize: tokens.textSm,
    lineHeight: 1,
    ':hover': {
      backgroundColor: 'color-mix(in srgb, #3b82f6 30%, #ffffff)',
    },
    '@media (prefers-color-scheme: dark)': {
      backgroundColor: 'color-mix(in srgb, #60a5fa 22%, transparent)',
      color: '#93c5fd',
      ':hover': {
        backgroundColor: 'color-mix(in srgb, #60a5fa 34%, transparent)',
      },
    },
  },
  mark: {
    width: '1.5rem',
    height: '1.5rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none',
    padding: 0,
    margin: 0,
    border: 'none',
    color: 'inherit',
    lineHeight: 0,
  },
  clip: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
})

type Notice = { text: string; error: boolean }

const FEEDBACK = /^\/f\s([\s\S]*)$/

export function Composer({ storyId }: { storyId: string }): ReactNode {
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<Notice>()
  const activity = useActivity(storyId)
  const [chip, setChip] = useState(false)
  const selected = useStoryUi(storyId).selected
  const turn = Boolean(activity.turnStartedAt)
  const busy = turn || Boolean(activity.phase && activity.phaseMs === undefined)

  function submitFeedback(text: string): void {
    const previous = draft
    setDraft('')
    setNotice(undefined)
    sendFeedback(storyId, text).then(
      () => {
        const saved = { text: 'Feedback saved', error: false }
        setNotice(saved)
        setTimeout(
          () => setNotice((current) => (current === saved ? undefined : current)),
          3000,
        )
      },
      (error: unknown) => {
        setDraft((current) => current || previous)
        setNotice({ text: messageOf(error), error: true })
      },
    )
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const feedback = FEEDBACK.exec(draft.trimStart())
    if (feedback) {
      const text = feedback[1]?.trim()
      if (text) submitFeedback(text)
      return
    }
    if (busy) return
    const text = draft.trim()
    if (!text) return
    const previous = draft
    setDraft('')
    void sendTurn(storyId, text, undefined, selected).then((ok) => {
      if (!ok) setDraft((current) => current || previous)
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
      {notice ? (
        <div
          role="status"
          aria-live="polite"
          title={notice.text}
          {...stylex.props(styles.notice, !notice.error && styles.saved)}
        >
          {notice.text}
        </div>
      ) : null}
      <div {...stylex.props(ui.pillow, selected.length > 0 && styles.tight)}>
        <textarea
          data-composer=""
          rows={1}
          value={draft}
          placeholder="Message..."
          autoComplete="off"
          {...stylex.props(ui.field)}
          onChange={(event) => {
            setDraft(event.target.value)
            if (notice?.error) setNotice(undefined)
          }}
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
                <Icon name="close" size="lg" />
              </button>
            ) : (
              <span {...stylex.props(styles.mark)}>
                <Icon name="pointer" size="lg" />
              </span>
            )}
            <span>{selected.length}</span>
          </span>
        ) : null}
        {turn ? (
          <button
            type="button"
            aria-label="Stop"
            {...stylex.props(styles.stop)}
            onClick={() => stopTurn(storyId)}
          >
            <Icon name="stop" />
          </button>
        ) : activity.error ? (
          <span aria-live="polite" {...stylex.props(styles.status)}>
            <span {...stylex.props(styles.clip)}>{activity.error}</span>
          </span>
        ) : null}
      </div>
    </form>
  )
}
