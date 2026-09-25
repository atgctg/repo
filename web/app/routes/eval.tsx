import type { ReactNode } from 'react'
import { data, Link } from 'react-router'
import * as stylex from '@stylexjs/stylex'
import { useMountEffect } from '~/hooks/use-mount-effect'
import { fetchEval, type EvalView } from '~/lib/api'
import { tokens } from '~/styles/tokens.stylex'
import type { Route } from './+types/eval'

const styles = stylex.create({
  page: {
    minHeight: '100dvh',
    padding: '1.5rem 1.25rem 3rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.75rem',
    backgroundColor: tokens.bg,
    color: tokens.text,
  },
  back: {
    color: tokens.muted,
    fontSize: tokens.textSm,
  },
  block: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    minWidth: 0,
  },
  label: {
    color: tokens.muted,
    fontSize: tokens.textXs,
    fontWeight: 600,
  },
  text: {
    whiteSpace: 'pre-wrap',
    fontSize: tokens.textSm,
    lineHeight: 1.45,
  },
  raw: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.75rem',
    lineHeight: 1.45,
  },
})

export async function clientLoader({
  params,
}: Route.ClientLoaderArgs): Promise<EvalView> {
  const view = await fetchEval(params.id ?? '')
  if (!view) throw data(null, { status: 404 })
  return view
}

clientLoader.hydrate = true as const

export function HydrateFallback(): ReactNode {
  return <p {...stylex.props(styles.back)}>Loading</p>
}

function Title({ title }: { title: string }): null {
  useMountEffect(() => {
    document.title = title
  })
  return null
}

function Raw({ value }: { value: unknown }): ReactNode {
  return <pre {...stylex.props(styles.raw)}>{JSON.stringify(value, null, 2)}</pre>
}

export default function EvalRoute({ loaderData }: Route.ComponentProps): ReactNode {
  return (
    <main {...stylex.props(styles.page)}>
      <Title title={loaderData.name} />
      <Link to="/" {...stylex.props(styles.back)}>
        {loaderData.name}
      </Link>
      <section {...stylex.props(styles.block)}>
        <h2 {...stylex.props(styles.label)}>Input</h2>
        <Raw value={loaderData.input} />
      </section>
      <section {...stylex.props(styles.block)}>
        <h2 {...stylex.props(styles.label)}>Expected</h2>
        <p {...stylex.props(styles.text)}>{loaderData.expected}</p>
      </section>
      <section {...stylex.props(styles.block)}>
        <h2 {...stylex.props(styles.label)}>Output</h2>
        <Raw value={loaderData.output} />
      </section>
      <section {...stylex.props(styles.block)}>
        <h2 {...stylex.props(styles.label)}>LLM</h2>
        <Raw value={loaderData.trace} />
      </section>
    </main>
  )
}

export function ErrorBoundary(): ReactNode {
  return <p {...stylex.props(styles.back)}>Not found</p>
}
