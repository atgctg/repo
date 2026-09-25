import { useRef, useSyncExternalStore, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Tooltip } from '@base-ui/react/tooltip'
import * as stylex from '@stylexjs/stylex'
import type { Story, StoryEvent } from 'shared'
import { useMountEffect } from '~/hooks/use-mount-effect'
import { writeVerdict, type EvalRun, type EvalVerdict } from '~/lib/api'
import { evalsKey, evalsQuery, queryClient } from '~/lib/query'
import { ensureStory, selectScenes } from '~/lib/store'
import { tokens } from '~/styles/tokens.stylex'

const styles = stylex.create({
  note: {
    height: '100%',
    minHeight: 0,
    padding: '1.35rem 1.15rem 1.35rem 0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  name: {
    margin: 0,
    fontSize: tokens.textSm,
    fontWeight: 600,
    lineHeight: 1.4,
  },
  description: {
    margin: 0,
    color: tokens.muted,
    fontSize: tokens.textSm,
    lineHeight: 1.45,
  },
  bar: {
    position: 'absolute',
    left: '50%',
    bottom: '1.25rem',
    zIndex: 20,
    isolation: 'isolate',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '0.35rem',
    padding: '0.35rem',
    borderRadius: tokens.radiusPill,
    backgroundColor: tokens.chip,
  },
  button: {
    borderRadius: tokens.radiusPill,
    padding: '0.45rem 1rem',
    backgroundColor: 'transparent',
    fontSize: tokens.textMd,
    fontWeight: 400,
    lineHeight: 1.2,
    color: tokens.text,
    ':hover': {
      backgroundColor: tokens.bg,
    },
  },
  done: {
    position: 'absolute',
    left: '50%',
    bottom: '1.25rem',
    zIndex: 20,
    isolation: 'isolate',
    transform: 'translateX(-50%)',
    padding: '0.5rem 0.95rem',
    borderRadius: tokens.radiusPill,
    backgroundColor: tokens.chip,
    color: tokens.muted,
    fontSize: tokens.textMd,
    fontWeight: 400,
  },
  tip: {
    borderRadius: '0.35rem',
    backgroundColor: tokens.text,
    color: tokens.bg,
    padding: '0.12rem 0.38rem',
    fontSize: tokens.textXs,
    fontWeight: 600,
    lineHeight: 1.4,
  },
})

type Stamp = { id: string; verdict: EvalVerdict }

type Session = {
  skipped: string[]
  history: Stamp[]
}

let session: Session = { skipped: [], history: [] }
const listeners = new Set<() => void>()

function publish(next: Session): void {
  session = next
  for (const listener of listeners) listener()
}

function useSession(): Session {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => session,
    () => session,
  )
}

function lastUserIndex(events: StoryEvent[]): number {
  for (let index = events.length - 1; index >= 0; index--) {
    if (events[index]?.type === 'input') return index
  }
  return -1
}

function outputSceneIndices(story: Story): number[] {
  const cut = lastUserIndex(story.events)
  if (cut < 0) return []
  const indices: number[] = []
  story.scenes.forEach((scene, index) => {
    if (scene.event > cut) indices.push(index)
  })
  return indices
}

function nextId(
  current: string,
  runs: EvalRun[] | undefined,
  skipped = session.skipped,
): string | undefined {
  return runs?.find(
    (run) => run.verdict === null && run.id !== current && !skipped.includes(run.id),
  )?.id
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function PreloadNext({ storyId }: { storyId: string }): ReactNode {
  const { data: runs } = useQuery(evalsQuery())
  const { skipped } = useSession()
  const id = nextId(storyId, runs, skipped)
  if (!id) return null
  return <Preload key={id} id={id} />
}

function Preload({ id }: { id: string }): null {
  useMountEffect(() => {
    void ensureStory(id)
  })
  return null
}

export function EvalFocus({ story }: { story: Story }): null {
  useMountEffect(() => {
    const indices = outputSceneIndices(story)
    if (indices.length > 0) selectScenes(story.id, indices)
    const scene = indices[0]
    if (scene !== undefined) {
      document
        .querySelector(`[data-scene="${scene}"]`)
        ?.scrollIntoView({ block: 'start' })
    }
    const cut = lastUserIndex(story.events)
    document
      .querySelector(`[data-event="${cut < 0 ? 0 : cut + 1}"]`)
      ?.scrollIntoView({ block: 'center' })
  })
  return null
}

export function EvalNote({
  storyId,
  caseName,
}: {
  storyId: string
  caseName: string
}): ReactNode {
  const { data: runs } = useQuery(evalsQuery())
  const description = runs?.find((run) => run.id === storyId)?.description
  return (
    <div {...stylex.props(styles.note)}>
      <h2 {...stylex.props(styles.name)}>{caseName}</h2>
      {description ? <p {...stylex.props(styles.description)}>{description}</p> : null}
    </div>
  )
}

function HudButton({
  label,
  shortcut,
  onClick,
}: {
  label: string
  shortcut: string
  onClick: () => void
}): ReactNode {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger delay={250} {...stylex.props(styles.button)} onClick={onClick}>
        {label}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={8} style={{ zIndex: 30 }}>
          <Tooltip.Popup {...stylex.props(styles.tip)}>{shortcut}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function EvalBar({ storyId }: { storyId: string }): ReactNode {
  const navigate = useNavigate()
  const { data: runs } = useQuery(evalsQuery())
  const verdictMutation = useMutation({
    scope: { id: 'verdicts' },
    mutationFn: ({ id, verdict }: { id: string; verdict: EvalVerdict | null }) =>
      writeVerdict(id, verdict),
    onMutate: async ({ id, verdict }, context) => {
      const previous = context.client.getQueryData<EvalRun[]>(evalsKey)
      context.client.setQueryData<EvalRun[]>(evalsKey, (current) =>
        current?.map((run) => (run.id === id ? { ...run, verdict } : run)),
      )
      await context.client.cancelQueries({ queryKey: evalsKey })
      return { previous }
    },
    onError: (_error, _vars, result, context) => {
      if (result?.previous) context.client.setQueryData(evalsKey, result.previous)
    },
    onSettled: (_data, _error, _vars, _result, context) => {
      void context.client.invalidateQueries({ queryKey: evalsKey })
    },
  })
  const storyRef = useRef(storyId)
  storyRef.current = storyId
  const reviewed =
    runs !== undefined && runs.length > 0 && runs.every((run) => run.verdict !== null)

  function go(id: string | undefined): void {
    if (!id) return
    const following = nextId(id, queryClient.getQueryData<EvalRun[]>(evalsKey))
    if (following) void ensureStory(following)
    void navigate(`/${id}`)
  }

  function judge(verdict: EvalVerdict): void {
    const id = storyRef.current
    const current = queryClient.getQueryData<EvalRun[]>(evalsKey)
    if (!current) return
    const upcoming = nextId(id, current)
    publish({
      ...session,
      history: [{ id, verdict }, ...session.history],
    })
    verdictMutation.mutate({ id, verdict })
    go(upcoming)
  }

  function skip(): void {
    const id = storyRef.current
    const upcoming = nextId(id, queryClient.getQueryData<EvalRun[]>(evalsKey))
    if (session.skipped.includes(id)) {
      go(upcoming)
      return
    }
    publish({ ...session, skipped: [...session.skipped, id] })
    go(upcoming)
  }

  function undo(): void {
    const last = session.history[0]
    if (!last || !queryClient.getQueryData<EvalRun[]>(evalsKey)) return
    publish({
      ...session,
      history: session.history.slice(1),
      skipped: session.skipped.filter((item) => item !== last.id),
    })
    verdictMutation.mutate({ id: last.id, verdict: null })
    void navigate(`/${last.id}`)
  }

  const actions = useRef({ judge, skip, undo })
  actions.current = { judge, skip, undo }
  useMountEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.repeat || isTyping(event.target)) return
      if (
        event.metaKey &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        event.key.toLowerCase() === 'z'
      ) {
        event.preventDefault()
        actions.current.undo()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'p') {
        event.preventDefault()
        actions.current.judge('pass')
      } else if (key === 'f') {
        event.preventDefault()
        actions.current.judge('fail')
      } else if (key === 's') {
        event.preventDefault()
        actions.current.skip()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (runs === undefined) return null
  if (reviewed) return <p {...stylex.props(styles.done)}>All reviewed</p>
  return (
    <Tooltip.Provider>
      <div {...stylex.props(styles.bar)}>
        <HudButton label="Pass" shortcut="P" onClick={() => judge('pass')} />
        <HudButton label="Fail" shortcut="F" onClick={() => judge('fail')} />
        <HudButton label="Skip" shortcut="S" onClick={skip} />
      </div>
    </Tooltip.Provider>
  )
}
