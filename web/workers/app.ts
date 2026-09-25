import { createRequestHandler } from 'react-router'

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
)

const API_ORIGIN = 'http://127.0.0.1:3000'

function isAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/assets/') ||
    pathname === '/favicon.ico'
  )
}

async function proxyApi(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const target = new URL(`${url.pathname}${url.search}`, API_ORIGIN)
  const headers = new Headers(request.headers)
  headers.delete('host')
  const method = request.method
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
    redirect: 'manual',
  }
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = request.body
    init.duplex = 'half'
  }
  return fetch(target, init)
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url)
    if (isAssetPath(url.pathname)) return proxyApi(request)
    return requestHandler(request)
  },
}
