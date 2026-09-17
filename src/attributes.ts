export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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
