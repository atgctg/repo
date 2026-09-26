import type { FrameInputs } from './contract'
import { isPlainObject } from './records'
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
  run: (send: (message: TurnMessage) => void, signal: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
): Response {
  const stop = new AbortController()
  const abort = () => stop.abort()
  signal?.addEventListener('abort', abort, { once: true })
  let open = true
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (message: TurnMessage) => {
        if (!open) return
        try {
          controller.enqueue(encodeFrame(message))
        } catch {
          open = false
        }
      }
      void run(send, stop.signal)
        .then(
          () => {
            if (open) controller.close()
          },
          (error: unknown) => {
            if (open) controller.error(error)
          },
        )
        .finally(() => {
          open = false
          signal?.removeEventListener('abort', abort)
        })
    },
    cancel() {
      open = false
      abort()
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'application/octet-stream' },
  })
}

export async function* readFrames(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<TurnMessage> {
  const reader = body.getReader()
  let pending = new Uint8Array()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      if (!value || value.byteLength === 0) continue
      const decoded = decodeFrames(concatBytes([pending, value]))
      pending = new Uint8Array(decoded.rest)
      yield* decoded.messages
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

export const FRAME_ROUTES = {
  turn: 'stories/turn',
  evalRun: 'evals/run',
} as const satisfies Record<keyof FrameInputs, string>

type FrameCall<K extends keyof FrameInputs> = (
  input: FrameInputs[K],
  options?: { signal?: AbortSignal },
) => AsyncGenerator<TurnMessage>

export type FrameClient = { [K in keyof FrameInputs]: FrameCall<K> }

async function errorText(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  if (isPlainObject(body) && typeof body.error === 'string' && body.error)
    return body.error
  return `Request failed (${response.status})`
}

export function createFrameClient(options: {
  url: string
  headers?: Record<string, string>
  fetch?: (request: Request) => Promise<Response>
}): FrameClient {
  const send = options.fetch ?? ((request: Request) => fetch(request))
  const call = <K extends keyof FrameInputs>(key: K): FrameCall<K> =>
    async function* (input, { signal } = {}) {
      const response = await send(
        new Request(`${options.url.replace(/\/$/, '')}/${FRAME_ROUTES[key]}`, {
          method: 'POST',
          headers: { ...options.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
          signal,
        }),
      )
      if (!response.ok) throw new Error(await errorText(response))
      if (!response.body) throw new Error('Stream failed')
      yield* readFrames(response.body)
    }
  return { turn: call('turn'), evalRun: call('evalRun') }
}
