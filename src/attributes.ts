export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deletePath(target: Record<string, unknown>, keys: string[]): void {
  const [head, ...rest] = keys
  if (!head) return
  if (rest.length === 0) {
    delete target[head]
    return
  }
  const next = target[head]
  if (!isPlainObject(next)) return
  deletePath(next, rest)
  if (Object.keys(next).length === 0) delete target[head]
}

function setPath(target: Record<string, unknown>, keys: string[], value: unknown): void {
  const [head, ...rest] = keys
  if (!head) return
  if (rest.length === 0) {
    if (value === null) delete target[head]
    else target[head] = value
    return
  }
  if (value === null) {
    deletePath(target, keys)
    return
  }
  const current = target[head]
  const next = isPlainObject(current) ? current : {}
  target[head] = next
  setPath(next, rest, value)
}

export function mergeAttributes(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = structuredClone(base)
  for (const [key, value] of Object.entries(patch)) {
    if (key.includes('.')) {
      setPath(result, key.split('.').filter(Boolean), value)
      continue
    }
    if (value === null) {
      delete result[key]
      continue
    }
    const existing = result[key]
    if (isPlainObject(value) && isPlainObject(existing)) {
      result[key] = mergeAttributes(existing, value)
      continue
    }
    result[key] = structuredClone(value)
  }
  return result
}
