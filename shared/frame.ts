import { isTurnMessage, type TurnMessage } from './turn'

const HEADER = 5
const JSON_FRAME = 1

export function encodeFrame(message: TurnMessage): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify(message))
  const frame = new Uint8Array(HEADER + payload.byteLength)
  const view = new DataView(frame.buffer)
  view.setUint8(0, JSON_FRAME)
  view.setUint32(1, payload.byteLength, false)
  frame.set(payload, HEADER)
  return frame
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

export function decodeFrames(bytes: Uint8Array): {
  messages: TurnMessage[]
  rest: Uint8Array
} {
  const messages: TurnMessage[] = []
  let offset = 0
  while (offset + HEADER <= bytes.byteLength) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, HEADER)
    const type = view.getUint8(0)
    const length = view.getUint32(1, false)
    const end = offset + HEADER + length
    if (end > bytes.byteLength) break
    if (type === JSON_FRAME) {
      const text = new TextDecoder().decode(bytes.subarray(offset + HEADER, end))
      const parsed = JSON.parse(text) as unknown
      if (!isTurnMessage(parsed)) throw new Error('Bad turn message')
      messages.push(parsed)
    }
    offset = end
  }
  const rest = new Uint8Array(bytes.byteLength - offset)
  rest.set(bytes.subarray(offset))
  return { messages, rest }
}

export function turnResponse(
  run: (send: (message: TurnMessage) => void) => Promise<void>,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true
      const send = (message: TurnMessage) => {
        if (!open) return
        try {
          controller.enqueue(encodeFrame(message))
        } catch {
          open = false
        }
      }
      try {
        await run(send)
      } finally {
        open = false
        try {
          controller.close()
        } catch {
          open = false
        }
      }
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'application/octet-stream' },
  })
}

export async function readTurn(
  body: ReadableStream<Uint8Array>,
  onMessage: (message: TurnMessage) => void,
): Promise<void> {
  const reader = body.getReader()
  let pending = new Uint8Array()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value || value.byteLength === 0) continue
    const decoded = decodeFrames(concatBytes([pending, value]))
    pending = new Uint8Array(decoded.rest)
    for (const message of decoded.messages) onMessage(message)
  }
}
