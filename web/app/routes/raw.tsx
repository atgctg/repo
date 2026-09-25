import type { ReactNode } from 'react'
import { data } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import { fetchMessages, type RawMessage } from '~/lib/api'
import { ensureIndex, ensureStory, hasEntry } from '~/lib/store'
import { tokens } from '~/styles/tokens.stylex'
import { ui } from '~/styles/ui'
import type { Route } from './+types/raw'

const styles = stylex.create({
  list: {
    height: '100%',
    minHeight: 0,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    padding: '1rem 1.25rem 3rem',
    maxWidth: '46rem',
  },
  message: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  role: {
    color: tokens.muted,
    fontSize: tokens.textXs,
    fontWeight: 600,
  },
  text: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontSize: tokens.textSm,
    lineHeight: 1.45,
  },
  json: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.75rem',
    lineHeight: 1.45,
  },
  note: {
    padding: '2rem',
  },
  ok: {
    margin: 0,
    color: tokens.muted,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.75rem',
    lineHeight: 1.45,
  },
})

export async function clientLoader({
  params,
}: Route.ClientLoaderArgs): Promise<RawMessage[]> {
  const id = params.id
  if (!id) throw data(null, { status: 404 })
  await Promise.all([ensureIndex(), hasEntry(id) ? Promise.resolve() : ensureStory(id)])
  if (!hasEntry(id)) throw data(null, { status: 404 })
  const messages = await fetchMessages(id)
  if (!messages) throw data(null, { status: 404 })
  return messages
}

clientLoader.hydrate = true as const

export function HydrateFallback(): ReactNode {
  return <p {...stylex.props(ui.muted, styles.note)}>Loading</p>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parsedArguments(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function prettyCalls(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  return value.map((call) => {
    if (!isRecord(call) || !isRecord(call.function)) return call
    return {
      ...call,
      function: { ...call.function, arguments: parsedArguments(call.function.arguments) },
    }
  })
}

type RawRow =
  | { kind: 'message'; message: RawMessage; key: number }
  | { kind: 'ok'; count: number; key: number }

function rawRows(messages: RawMessage[]): RawRow[] {
  const rows: RawRow[] = []
  let count = 0
  let start = 0
  const flush = (): void => {
    if (count === 0) return
    rows.push({ kind: 'ok', count, key: start })
    count = 0
  }
  for (const [index, message] of messages.entries()) {
    if (message.role === 'tool' && message.content === 'ok') {
      if (count === 0) start = index
      count += 1
      continue
    }
    flush()
    rows.push({ kind: 'message', message, key: index })
  }
  flush()
  return rows
}

function Message({ message }: { message: RawMessage }): ReactNode {
  const text = message.role === 'tool' ? undefined : message.content
  const json =
    message.role === 'tool'
      ? { tool_call_id: message.tool_call_id, content: message.content }
      : prettyCalls(message.tool_calls)
  return (
    <article {...stylex.props(styles.message)}>
      <h2 {...stylex.props(styles.role)}>{message.role}</h2>
      {text ? <p {...stylex.props(styles.text)}>{text}</p> : null}
      {json !== undefined ? (
        <pre {...stylex.props(styles.json)}>{JSON.stringify(json, null, 2)}</pre>
      ) : null}
    </article>
  )
}

export default function RawRoute({ loaderData }: Route.ComponentProps): ReactNode {
  return (
    <div {...stylex.props(styles.list)}>
      {rawRows(loaderData).map((row) =>
        row.kind === 'ok' ? (
          <p key={row.key} {...stylex.props(styles.ok)}>
            tool ×{row.count}: ok
          </p>
        ) : (
          <Message key={row.key} message={row.message} />
        ),
      )}
    </div>
  )
}

export function ErrorBoundary(): ReactNode {
  return <p {...stylex.props(ui.muted, styles.note)}>Not found</p>
}
