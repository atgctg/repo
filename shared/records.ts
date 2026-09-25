export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return normalizeValue(JSON.parse(trimmed))
      } catch {
        return value
      }
    }
    return value
  }
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, normalizeValue(v)]),
    )
  }
  return value
}

export function normalizeRecord(value: unknown): Record<string, unknown> {
  const normalized = normalizeValue(value)
  return isPlainObject(normalized) ? normalized : {}
}

export function mergeAttributes(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = structuredClone(base)
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key]
    } else if (isPlainObject(value) && isPlainObject(result[key])) {
      const merged = mergeAttributes(result[key] as Record<string, unknown>, value)
      if (Object.keys(merged).length === 0) {
        delete result[key]
      } else {
        result[key] = merged
      }
    } else {
      result[key] = structuredClone(value)
    }
  }
  return result
}
