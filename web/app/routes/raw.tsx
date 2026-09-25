import type { ReactNode } from 'react'
import { data, Link, useNavigate, useParams } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import { Icon } from '~/components/icons'
import { useMountEffect } from '~/hooks/use-mount-effect'
import { fetchMessages, type RawMessage } from '~/lib/api'
import { ensureIndex, ensureStory, hasEntry, useStory } from '~/lib/store'
import { tokens } from '~/styles/tokens.stylex'
import { ui } from '~/styles/ui'
import type { Route } from './+types/raw'

const styles = stylex.create({
  page: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: tokens.bg,
    color: tokens.text,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 0.75rem 0.25rem',
  },
  title: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: tokens.textMd,
    fontWeight: 500,
  },
  raw: {
    marginLeft: 'auto',
  },
  list: {
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

function Title({ title }: { title: string }): null {
  useMountEffect(() => {
    document.title = title
  })
  return null
}

function Message({ message }: { message: RawMessage }): ReactNode {
  const text = message.role === 'tool' ? undefined : message.content
  const json =
    message.role === 'tool'
      ? { tool_call_id: message.tool_call_id, content: message.content }
      : message.tool_calls
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
  const { id } = useParams()
  const story = useStory(id ?? '')
  const navigate = useNavigate()
  if (!story) return <p {...stylex.props(ui.muted, styles.note)}>Not found</p>
  return (
    <main {...stylex.props(styles.page)}>
      <Title title={story.title} />
      <header {...stylex.props(styles.header)}>
        <Link to="/" aria-label="Worlds" {...stylex.props(ui.iconButton)}>
          <Icon name="back" />
        </Link>
        <h1 {...stylex.props(styles.title)}>{story.title}</h1>
        <button
          type="button"
          aria-pressed
          {...stylex.props(ui.ghost, ui.ghostOn, styles.raw)}
          onClick={() => void navigate(`/${story.id}`)}
        >
          Raw
        </button>
      </header>
      <div {...stylex.props(styles.list)}>
        {loaderData.map((message, index) => (
          <Message key={index} message={message} />
        ))}
      </div>
    </main>
  )
}

export function ErrorBoundary(): ReactNode {
  return <p {...stylex.props(ui.muted, styles.note)}>Not found</p>
}
