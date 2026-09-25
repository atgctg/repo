import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router'
import * as stylex from '@stylexjs/stylex'
import { Hotkeys } from '~/components/hotkeys'
import { queryClient } from '~/lib/query'
import { ui } from '~/styles/ui'
import './global.css'

if (import.meta.env.DEV && !import.meta.env.SSR) {
  void import('virtual:stylex:runtime')
}

const styles = stylex.create({
  note: {
    padding: '2rem',
  },
})

export function Layout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <Meta />
        <Links />
        {import.meta.env.DEV ? (
          <link rel="stylesheet" href="/virtual:stylex.css" />
        ) : null}
      </head>
      <body {...stylex.props(ui.body)}>
        <QueryClientProvider client={queryClient}>
          <Hotkeys />
          {children}
          <ScrollRestoration />
          <Scripts />
        </QueryClientProvider>
      </body>
    </html>
  )
}

export default function App(): ReactNode {
  return <Outlet />
}

export function ErrorBoundary({ error }: { error: unknown }): ReactNode {
  let message = 'Something went wrong'
  if (isRouteErrorResponse(error))
    message = error.status === 404 ? 'Not found' : error.statusText
  else if (error instanceof Error) message = error.message
  return <p {...stylex.props(ui.muted, styles.note)}>{message}</p>
}
