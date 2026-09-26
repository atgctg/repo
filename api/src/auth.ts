export async function adminOk(
  request: Request,
  password: string | undefined,
): Promise<boolean> {
  if (!password) return false
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const encoder = new TextEncoder()
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(token)),
    crypto.subtle.digest('SHA-256', encoder.encode(password)),
  ])
  return sameBytes(left, right)
}

function sameBytes(left: ArrayBuffer, right: ArrayBuffer): boolean {
  const subtle = crypto.subtle
  if (hasWorkersEqual(subtle)) return subtle.timingSafeEqual(left, right)
  return crypto.timingSafeEqual(new Uint8Array(left), new Uint8Array(right))
}

function hasWorkersEqual(subtle: object): subtle is {
  timingSafeEqual(left: ArrayBuffer, right: ArrayBuffer): boolean
} {
  return 'timingSafeEqual' in subtle && isByteCompare(subtle.timingSafeEqual)
}

function isByteCompare(
  value: unknown,
): value is (left: ArrayBuffer, right: ArrayBuffer) => boolean {
  return typeof value === 'function'
}
