import { isbot } from 'isbot'
import { renderToReadableStream } from 'react-dom/server'
import type { EntryContext, RouterContextProvider } from 'react-router'
import { ServerRouter } from 'react-router'

const streamTimeout = 5_000

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
): Promise<Response> {
  void loadContext
  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    })
  }
  let status = responseStatusCode
  let shellRendered = false
  const body = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} />,
    {
      signal: AbortSignal.timeout(streamTimeout + 1000),
      onError(error: unknown) {
        status = 500
        if (shellRendered) console.error(error)
      },
    },
  )
  shellRendered = true
  if (isbot(request.headers.get('user-agent') ?? '') || routerContext.isSpaMode)
    await body.allReady
  responseHeaders.set('Content-Type', 'text/html')
  return new Response(body, {
    headers: responseHeaders,
    status,
  })
}
