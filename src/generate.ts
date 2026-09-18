import { stringify } from 'yaml'
import type { Story } from './types'

const PRUNA_MODEL = 'p-image' as const
const IMAGE_ASPECT_RATIO = '9:16' as const
const STORIES_DIR = `${import.meta.dir}/../stories`

export function safeStoryId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function mediaFileName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'image'}.jpg`
}

export function mediaDiskPath(storyId: string, name: string): string {
  return `${STORIES_DIR}/media/${safeStoryId(storyId)}/${mediaFileName(name)}`
}

export function mediaUrl(storyId: string, name: string): string {
  return `/media/${encodeURIComponent(safeStoryId(storyId))}/${encodeURIComponent(mediaFileName(name))}`
}

function promptWithStyle(story: Story, prompt: Record<string, unknown>): string {
  const hasStyle = Object.keys(prompt).some((k) => k.toLowerCase() === 'style')
  const style = !hasStyle && story.cards.find((card) => card.name.toLowerCase() === 'style')?.attributes
  const chunks: string[] = [stringify(prompt, { indent: 2 }).trim()]
  if (style && Object.keys(style).length > 0) {
    chunks.push(stringify({ Style: style }, { indent: 2 }).trim())
  }
  return chunks.join('\n')
}

type PrunaStatus = 'succeeded' | 'starting' | 'processing' | 'failed' | 'unknown'

type PrunaPrediction = {
  status?: unknown
  generation_url?: unknown
  get_url?: unknown
  error?: unknown
  message?: unknown
}

function prunaStatus(value: unknown): PrunaStatus {
  return value === 'succeeded' || value === 'starting' || value === 'processing' || value === 'failed'
    ? value
    : 'unknown'
}

function absolutePrunaUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('/')) return `https://api.pruna.ai${url}`
  return `https://api.pruna.ai/${url}`
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function generatePrunaImage(prompt: string): Promise<ArrayBuffer> {
  const apiKey = Bun.env.PRUNA_API_KEY?.trim()
  if (!apiKey) throw new Error('PRUNA_API_KEY is required for image gen')

  const response = await fetch('https://api.pruna.ai/v1/predictions', {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Model: PRUNA_MODEL,
      'Try-Sync': 'true',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        prompt,
        aspect_ratio: IMAGE_ASPECT_RATIO,
      },
    }),
  })

  const body = await response.text()
  if (!response.ok) {
    throw new Error(`Pruna API error: ${body}`)
  }

  let parsed: PrunaPrediction
  try {
    parsed = JSON.parse(body) as PrunaPrediction
  } catch {
    throw new Error(`Pruna API returned non-JSON: ${body.slice(0, 500)}`)
  }

  const generationUrl = await resolvePrunaGenerationUrl(parsed, apiKey)
  return fetchImageBytes(absolutePrunaUrl(generationUrl), { apikey: apiKey })
}

async function resolvePrunaGenerationUrl(parsed: PrunaPrediction, apiKey: string): Promise<string> {
  const immediate = typeof parsed.generation_url === 'string' ? parsed.generation_url : undefined
  if (prunaStatus(parsed.status) === 'succeeded' && immediate) return immediate

  const statusUrl = typeof parsed.get_url === 'string' ? parsed.get_url : undefined
  if (!statusUrl) {
    throw new Error(`Pruna API returned no image: ${JSON.stringify(parsed).slice(0, 500)}`)
  }

  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const statusRes = await fetch(statusUrl, { headers: { apikey: apiKey } })
    const statusBody = await statusRes.text()
    if (!statusRes.ok) throw new Error(`Pruna status error: ${statusBody}`)

    let statusParsed: PrunaPrediction
    try {
      statusParsed = JSON.parse(statusBody) as PrunaPrediction
    } catch {
      throw new Error(`Pruna status returned non-JSON: ${statusBody.slice(0, 500)}`)
    }

    const status = prunaStatus(statusParsed.status)
    switch (status) {
      case 'succeeded': {
        if (typeof statusParsed.generation_url !== 'string' || !statusParsed.generation_url) {
          throw new Error('Pruna succeeded without generation_url')
        }
        return statusParsed.generation_url
      }
      case 'failed': {
        const detail =
          typeof statusParsed.error === 'string'
            ? statusParsed.error
            : typeof statusParsed.message === 'string'
              ? statusParsed.message
              : statusBody.slice(0, 500)
        throw new Error(`Pruna generation failed: ${detail}`)
      }
      case 'starting':
      case 'processing':
      case 'unknown': {
        await Bun.sleep(1000)
        break
      }
      default: {
        const _exhaustive: never = status
        throw new Error(`Unhandled Pruna status: ${_exhaustive}`)
      }
    }
  }

  throw new Error('Pruna generation timed out')
}

export async function generateStoryImage(
  story: Story,
  name: string,
  prompt: Record<string, unknown>,
): Promise<string> {
  const storyId = story.id
  const started = performance.now()
  const yamlPrompt = promptWithStyle(story, prompt)
  console.error('img gen start', { storyId, name })
  try {
    const buffer = await generatePrunaImage(yamlPrompt)
    await Bun.write(mediaDiskPath(storyId, name), buffer)
    const url = mediaUrl(storyId, name)
    console.error('img gen ok', {
      storyId,
      name,
      url,
      bytes: buffer.byteLength,
      ms: Math.round(performance.now() - started),
    })
    return url
  } catch (error) {
    console.error('img gen error', {
      storyId,
      name,
      ms: Math.round(performance.now() - started),
      error: errorMessage(error),
    })
    throw error
  }
}

async function fetchImageBytes(url: string, headers: HeadersInit): Promise<ArrayBuffer> {
  const response = await fetch(url, { headers })
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500)
    throw new Error(`Pruna download error: ${response.status} ${body}`)
  }
  return response.arrayBuffer()
}
