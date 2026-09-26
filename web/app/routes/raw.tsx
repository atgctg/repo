import type { ReactNode } from 'react'
import { data } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import { isPlainObject } from 'shared'
import { fetchMessages, type RawMessage } from '~/lib/api'
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
    fontSize: '0.75rem',
    lineHeight: 1.45,
  },
  json: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.6875rem',
    lineHeight: 1.45,
  },
  note: {
    padding: '2rem',
  },
})

export async function clientLoader({
  params,
}: Route.ClientLoaderArgs): Promise<RawMessage[]> {
  const messages = params.id ? await fetchMessages(params.id) : undefined
  if (!messages) throw data(null, { status: 404 })
  return messages
}

clientLoader.hydrate = true as const

export function HydrateFallback(): ReactNode {
  return <p {...stylex.props(ui.muted, styles.note)}>Loading</p>
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
    if (!isPlainObject(call) || !isPlainObject(call.function)) return call
    return {
      ...call,
      function: { ...call.function, arguments: parsedArguments(call.function.arguments) },
    }
  })
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
      {loaderData.map((message, index) => (
        <Message key={index} message={message} />
      ))}
    </div>
  )
}

export function ErrorBoundary(): ReactNode {
  return <p {...stylex.props(ui.muted, styles.note)}>Not found</p>
}
