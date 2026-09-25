import { createHash, timingSafeEqual } from 'node:crypto'

export function adminOk(request: Request, password: string | undefined): boolean {
  if (!password) return false
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const left = createHash('sha256').update(token).digest()
  const right = createHash('sha256').update(password).digest()
  return timingSafeEqual(left, right)
}
