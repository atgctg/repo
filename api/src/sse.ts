import { errorMessage } from './media'

export function formatSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function sseResponse(
  run: (send: (event: string, data: unknown) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true
      const send = (event: string, data: unknown) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(formatSse(event, data)))
        } catch {
          open = false
        }
      }
      try {
        await run(send)
      } catch (error) {
        send('error', { error: errorMessage(error) })
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
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
}
