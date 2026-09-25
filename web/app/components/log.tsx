import { useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { ScrollArea } from '@base-ui/react/scroll-area'
import * as stylex from '@stylexjs/stylex'
import type { Story, StoryEvent } from 'shared'
import { Blocks } from './blocks'
import { Avatar } from './media'
import { Icon } from './icons'
import { eventDetail, eventIcon, eventLead } from '~/lib/detail'
import { sendTurn } from '~/lib/store'
import { selectScene } from '~/lib/store'
import { portraitUrl, sceneIndexForEvent } from '~/lib/view'
import { tokens } from '~/styles/tokens.stylex'
import { ui } from '~/styles/ui'

const styles = stylex.create({
  root: {
    height: '100%',
    minHeight: 0,
    position: 'relative',
  },
  viewport: {
    height: '100%',
    maskImage:
      'linear-gradient(to bottom, transparent, #000 2rem, #000 calc(100% - 8rem), transparent)',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '1rem 0.25rem 16rem',
  },
  event: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
    padding: '0.5rem 0.75rem',
    borderRadius: tokens.radiusCard,
    fontSize: tokens.textSm,
    lineHeight: 1.4,
    color: tokens.textSoft,
    textAlign: 'left',
    backgroundColor: 'transparent',
  },
  message: {
    color: tokens.text,
    whiteSpace: 'pre-wrap',
  },
  user: {
    padding: 0,
    backgroundColor: 'transparent',
  },
  line: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    minWidth: 0,
    width: '100%',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'left',
  },
  copy: {
    margin: 0,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: tokens.textMid,
    opacity: 0.45,
  },
  copyOpen: {
    whiteSpace: 'pre-wrap',
    overflow: 'visible',
    textOverflow: 'unset',
    fontSize: tokens.textMd,
    lineHeight: 1.35,
    color: 'inherit',
    opacity: 1,
    marginTop: '0.35rem',
  },
  thumb: {
    width: '1.5rem',
    height: '1.5rem',
    objectFit: 'cover',
    borderRadius: '0.2rem',
    backgroundColor: tokens.chip,
    flex: 'none',
  },
  thumbOpen: {
    width: '8rem',
    height: 'auto',
    borderRadius: '0.5rem',
  },
  label: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: tokens.textMid,
  },
  edit: {
    width: '100%',
    fieldSizing: 'content',
    maxHeight: '9rem',
    backgroundColor: 'transparent',
    color: 'inherit',
    font: 'inherit',
    lineHeight: 'inherit',
  },
})

export function Log({ story }: { story: Story }): ReactNode {
  return (
    <ScrollArea.Root {...stylex.props(styles.root)}>
      <ScrollArea.Viewport {...stylex.props(styles.viewport)}>
        <ScrollArea.Content {...stylex.props(styles.content)}>
          {story.events.map((event, index) => (
            <EventRow
              key={`${event.type}-${index}`}
              story={story}
              event={event}
              index={index}
            />
          ))}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
    </ScrollArea.Root>
  )
}

function EventRow({
  story,
  event,
  index,
}: {
  story: Story
  event: StoryEvent
  index: number
}): ReactNode {
  switch (event.type) {
    case 'message':
      return <MessageRow storyId={story.id} event={event} index={index} />
    case 'dialogue':
    case 'image':
    case 'video':
    case 'card':
    case 'delete':
      return <FoldRow story={story} event={event} index={index} />
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

function MessageRow({
  storyId,
  event,
  index,
}: {
  storyId: string
  event: Extract<StoryEvent, { type: 'message' }>
  index: number
}): ReactNode {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(event.text)
  if (event.user) {
    return (
      <div data-event={index} {...stylex.props(styles.event, styles.user)}>
        {editing ? (
          <div {...stylex.props(ui.pillow)}>
            <textarea
              rows={1}
              value={draft}
              {...stylex.props(styles.edit)}
              onChange={(change) => setDraft(change.target.value)}
              onKeyDown={(key: KeyboardEvent<HTMLTextAreaElement>) => {
                if (key.key === 'Escape') {
                  setDraft(event.text)
                  setEditing(false)
                  return
                }
                if (
                  key.key !== 'Enter' ||
                  key.shiftKey ||
                  key.metaKey ||
                  key.ctrlKey ||
                  key.altKey
                )
                  return
                key.preventDefault()
                const next = draft.trim()
                if (!next) return
                setEditing(false)
                void sendTurn(storyId, next, index)
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            {...stylex.props(ui.pillow)}
            onClick={() => {
              setDraft(event.text)
              setEditing(true)
            }}
          >
            {event.text}
          </button>
        )}
        <Blocks blocks={event.error ? [{ type: 'error', text: event.error }] : []} />
      </div>
    )
  }
  return (
    <div data-event={index} {...stylex.props(styles.event, styles.message)}>
      {event.text}
      <Blocks blocks={event.error ? [{ type: 'error', text: event.error }] : []} />
    </div>
  )
}

function FoldRow({
  story,
  event,
  index,
}: {
  story: Story
  event: Exclude<StoryEvent, { type: 'message' }>
  index: number
}): ReactNode {
  const [open, setOpen] = useState(false)
  const sceneIndex = sceneIndexForEvent(story, index)
  const blocks = eventDetail(story, event)
  const lead = eventLead(event)
  const icon = eventIcon(event)
  const copy = event.type === 'dialogue' ? event.caption : undefined
  const thumb =
    event.type === 'image'
      ? story.assets.find((asset) => asset.name === event.name)?.url
      : undefined
  const face =
    event.type === 'dialogue'
      ? portraitUrl(story, event.speaker || event.background)
      : undefined
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div data-event={index} {...stylex.props(styles.event)}>
        <Collapsible.Trigger
          {...stylex.props(styles.line)}
          onClick={(click) => {
            if (sceneIndex === undefined) return
            if (click.shiftKey) click.preventDefault()
            selectScene(story.id, sceneIndex, click.shiftKey)
          }}
        >
          {event.type === 'dialogue' ? (
            <Avatar name={lead} url={face} />
          ) : thumb && !open ? (
            <img src={thumb} alt="" {...stylex.props(styles.thumb)} />
          ) : icon ? (
            <Icon name={icon} />
          ) : null}
          <span {...stylex.props(styles.label)}>{lead}</span>
          {copy && !open ? <p {...stylex.props(styles.copy)}>{copy}</p> : null}
        </Collapsible.Trigger>
        <Collapsible.Panel>
          {thumb ? (
            <img src={thumb} alt="" {...stylex.props(styles.thumb, styles.thumbOpen)} />
          ) : null}
          {copy ? <p {...stylex.props(styles.copy, styles.copyOpen)}>{copy}</p> : null}
          <Blocks blocks={blocks} />
        </Collapsible.Panel>
      </div>
    </Collapsible.Root>
  )
}
