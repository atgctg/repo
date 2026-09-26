import { createRequestHandler } from 'react-router'

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
)

const API_ORIGIN = 'http://127.0.0.1:3000'
const COOKIE = 'verse_admin'

type Env = {
  API?: { fetch: (request: Request) => Promise<Response> }
  API_URL?: string
}

function isApiPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/assets/') ||
    pathname === '/favicon.ico'
  )
}

function readPassword(request: Request): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const item = part.trim()
    if (!item.startsWith(`${COOKIE}=`)) continue
    const value = item.slice(COOKIE.length + 1)
    if (!value) return undefined
    try {
      return decodeURIComponent(value)
    } catch {
      return undefined
    }
  }
  return undefined
}

function loginPage(message?: string): Response {
  const note = message ? `<p>${message}</p>` : ''
  return new Response(
    `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Verse</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #fff; color: #000; font: 16px system-ui, sans-serif; }
  @media (prefers-color-scheme: dark) { body { background: #000; color: #fff; } button { background: #fff; color: #000; } }
  form { display: grid; gap: 12px; width: min(20rem, calc(100% - 2rem)); }
  input, button { font: inherit; padding: 0.6rem 0.75rem; }
  input { border: 1px solid currentColor; background: transparent; color: inherit; }
  button { border: 0; background: #000; color: #fff; }
  p { margin: 0; color: #737373; }
</style>
<body>
  <form method="post" action="/login">
    <p>Verse</p>
    ${note}
    <input name="password" type="password" autocomplete="current-password" autofocus required>
    <button type="submit">Continue</button>
  </form>
</body>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

function callApi(request: Request, env: Env): Promise<Response> {
  const origin = import.meta.env.DEV ? API_ORIGIN : env.API_URL
  if (!origin) {
    if (!env.API) throw new Error('API binding or API_URL is required')
    return env.API.fetch(request)
  }
  const url = new URL(request.url)
  return fetch(new Request(new URL(`${url.pathname}${url.search}`, origin), request))
}

function proxyApi(request: Request, env: Env, password: string): Promise<Response> {
  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${password}`)
  headers.delete('host')
  return callApi(new Request(request, { headers, redirect: 'manual' }), env)
}

async function login(request: Request, env: Env): Promise<Response> {
  const form = await request.formData()
  const password = form.get('password')
  if (typeof password !== 'string' || !password) return loginPage('Password is required')
  const check = new Request(new URL('/api/worlds', request.url), {
    headers: { Authorization: `Bearer ${password}` },
  })
  let response: Response
  try {
    response = await callApi(check, env)
  } catch {
    return loginPage('Could not reach Verse')
  }
  if (!response.ok) return loginPage('Wrong password')
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/',
      'Set-Cookie': `${COOKIE}=${encodeURIComponent(password)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`,
    },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/login' && request.method === 'POST') return login(request, env)
    const password = readPassword(request)
    if (!password) {
      if (request.method === 'GET' && !isApiPath(url.pathname)) return loginPage()
      return new Response('Unauthorized', { status: 401 })
    }
    if (isApiPath(url.pathname)) return proxyApi(request, env, password)
    return requestHandler(request)
  },
}
