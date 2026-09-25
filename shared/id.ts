const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function storyId(worldId: string): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  let suffix = ''
  for (const byte of bytes) suffix += ALPHABET[byte % ALPHABET.length]
  return `${worldId}-${suffix}`
}
