import { stringify } from 'yaml'
import { concatBytes, type Speech, type Story } from 'shared'
import { readAssetBytes, resolveAssetKey, storyKey, writeAsset } from './assets'
import { app } from './context'
import { assetFileName, assetUrl, speechFileName } from './files'
import { sseData } from './stream'

const PRUNA_MODEL = 'p-image' as const
const PRUNA_EDIT_MODEL = 'p-image-edit' as const
const IMAGE_ASPECT_RATIO = '9:16' as const

const PRUNA_VIDEO_MODEL = 'p-video-2-pro' as const
const VIDEO_RESOLUTION = '480p' as const
const VIDEO_MODE = 'speed' as const
const VIDEO_MIN_SECONDS = 5 as const
const VIDEO_MAX_SECONDS = 15 as const
const VIDEO_DEFAULT_SECONDS = 5 as const

const VOICE_NAMES = ['Skylar', 'Daniel', 'Jacqueline', 'Gemma', 'Archie', 'Aiko'] as const
type VoiceName = (typeof VOICE_NAMES)[number]

const VOICE_IDS: Record<VoiceName, string> = {
  Skylar: 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4',
  Daniel: '47c38ca4-5f35-497b-b1a3-415245fb35e1',
  Jacqueline: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
  Gemma: '62ae83ad-4f6a-430b-af41-a9bede9286ca',
  Archie: 'ef191366-f52f-447a-a398-ed8c0f2943a1',
  Aiko: '498e7f37-7fa3-4e2c-b8e2-8b6e9276f956',
}

export function resolveVoiceId(input: string): string | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined
  const byName = VOICE_NAMES.find((n) => n.toLowerCase() === trimmed.toLowerCase())
  if (byName) return VOICE_IDS[byName]
  const byId = VOICE_NAMES.find(
    (n) => VOICE_IDS[n].toLowerCase() === trimmed.toLowerCase(),
  )
  if (byId) return VOICE_IDS[byId]
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed))
    return trimmed
  return undefined
}

function captionToTranscript(caption?: string): string {
  if (!caption) return ''
  return caption
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 1 && !(line.startsWith('*') && line.endsWith('*')))
    .map((line) => line.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
}

function promptWithStyle(story: Story, prompt: Record<string, unknown>): string {
  const hasStyle = Object.keys(prompt).some((k) => k.toLowerCase() === 'style')
  const style =
    !hasStyle &&
    story.cards.find((card) => card.name.toLowerCase() === 'style')?.attributes
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
  return value === 'succeeded' ||
    value === 'starting' ||
    value === 'processing' ||
    value === 'failed'
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index)
  return bytes
}

function extractPrunaFileId(parsed: unknown): string | undefined {
  if (typeof parsed === 'string' && parsed.trim()) return parsed.trim()
  if (parsed !== null && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    for (const key of ['id', 'file_id', 'fileId', 'key', 'name']) {
      const val = obj[key]
      if (typeof val === 'string' && val.trim()) return val.trim()
    }
    for (const key of ['file', 'data', 'result']) {
      const nested = extractPrunaFileId(obj[key])
      if (nested) return nested
    }
  }
  return undefined
}

async function uploadPrunaFile(bytes: ArrayBuffer, filename: string): Promise<string> {
  const apiKey = app().env.PRUNA_API_KEY?.trim()
  if (!apiKey) throw new Error('PRUNA_API_KEY is required for video gen')
  const form = new FormData()
  form.append('content', new File([bytes], filename, { type: 'image/jpeg' }))
  const response = await fetch('https://api.pruna.ai/v1/files', {
    method: 'POST',
    headers: { apikey: apiKey },
    body: form,
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`Pruna upload error: ${body.slice(0, 500)}`)
  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch {
    throw new Error(`Pruna upload returned non-JSON: ${body.slice(0, 500)}`)
  }
  const fileId = extractPrunaFileId(parsed)
  if (!fileId) throw new Error(`Pruna upload returned no id: ${body.slice(0, 500)}`)
  if (fileId.startsWith('http://') || fileId.startsWith('https://')) return fileId
  return `https://api.pruna.ai/v1/files/${fileId}`
}

async function prunaPredict(
  model: string,
  input: Record<string, unknown>,
  opts: { sync?: boolean; timeoutMs: number; intervalMs: number },
): Promise<ArrayBuffer> {
  const apiKey = app().env.PRUNA_API_KEY?.trim()
  if (!apiKey) throw new Error('PRUNA_API_KEY is required for generation')

  const response = await fetch('https://api.pruna.ai/v1/predictions', {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Model: model,
      ...(opts.sync ? { 'Try-Sync': 'true' } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  })

  const body = await response.text()
  if (!response.ok) {
    throw new Error(`Pruna API error: ${body.slice(0, 500)}`)
  }

  let parsed: PrunaPrediction
  try {
    parsed = JSON.parse(body) as PrunaPrediction
  } catch {
    throw new Error(`Pruna API returned non-JSON: ${body.slice(0, 500)}`)
  }

  const generationUrl = await resolvePrunaGenerationUrl(
    parsed,
    apiKey,
    opts.timeoutMs,
    opts.intervalMs,
  )
  return fetchAssetBytes(absolutePrunaUrl(generationUrl), { apikey: apiKey })
}

async function generatePrunaImage(prompt: string): Promise<ArrayBuffer> {
  return prunaPredict(
    PRUNA_MODEL,
    { prompt, aspect_ratio: IMAGE_ASPECT_RATIO },
    { sync: true, timeoutMs: 90_000, intervalMs: 1000 },
  )
}

async function generatePrunaImageEdit(
  prompt: string,
  imageUrls: string[],
): Promise<ArrayBuffer> {
  return prunaPredict(
    PRUNA_EDIT_MODEL,
    { prompt, images: imageUrls, aspect_ratio: IMAGE_ASPECT_RATIO },
    { sync: true, timeoutMs: 90_000, intervalMs: 1000 },
  )
}

async function generatePrunaVideo(
  prompt: string,
  imageUrl?: string,
  duration: number = VIDEO_DEFAULT_SECONDS,
  lastFrameUrl?: string,
): Promise<ArrayBuffer> {
  const clamped = Math.max(
    VIDEO_MIN_SECONDS,
    Math.min(VIDEO_MAX_SECONDS, Math.round(duration)),
  )
  const input: Record<string, unknown> = {
    prompt,
    duration: clamped,
    resolution: VIDEO_RESOLUTION,
    mode: VIDEO_MODE,
    aspect_ratio: IMAGE_ASPECT_RATIO,
  }
  if (imageUrl) input.image = imageUrl
  if (lastFrameUrl) input.last_frame_image = lastFrameUrl
  return prunaPredict(PRUNA_VIDEO_MODEL, input, { timeoutMs: 300_000, intervalMs: 2000 })
}

async function resolvePrunaGenerationUrl(
  parsed: PrunaPrediction,
  apiKey: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<string> {
  const immediate =
    typeof parsed.generation_url === 'string' ? parsed.generation_url : undefined
  if (prunaStatus(parsed.status) === 'succeeded' && immediate) return immediate

  const statusUrl = typeof parsed.get_url === 'string' ? parsed.get_url : undefined
  if (!statusUrl) {
    throw new Error(
      `Pruna API returned no output: ${JSON.stringify(parsed).slice(0, 500)}`,
    )
  }

  const deadline = Date.now() + timeoutMs
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
        if (
          typeof statusParsed.generation_url !== 'string' ||
          !statusParsed.generation_url
        ) {
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
        await sleep(intervalMs)
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
  references: string[] = [],
): Promise<string> {
  const storyId = story.id
  const started = performance.now()
  const yamlPrompt = promptWithStyle(story, prompt)
  console.error('img gen start', { storyId, name, references })
  try {
    const buffer =
      references.length > 0
        ? await generatePrunaImageEdit(
            yamlPrompt,
            await uploadNamedImages(story, references),
          )
        : await generatePrunaImage(yamlPrompt)
    await writeAsset(
      app().assets,
      storyKey(storyId, assetFileName(name, 'image')),
      new Uint8Array(buffer),
      'image/jpeg',
    )
    const url = assetUrl(storyId, name, 'image')
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

async function uploadNamedImages(story: Story, names: string[]): Promise<string[]> {
  if (names.length > 5) throw new Error('At most 5 reference images')
  const urls: string[] = []
  for (const name of names) {
    const url = await uploadFrame(story, name)
    if (!url) throw new Error(`Reference image "${name}" not found`)
    urls.push(url)
  }
  return urls
}

async function uploadFrame(story: Story, frameName: string): Promise<string | undefined> {
  const storyId = story.id
  const ref = story.assets.find(
    (asset) => asset.name.toLowerCase() === frameName.toLowerCase(),
  )
  const diskName = ref?.name ?? frameName
  const key = await resolveAssetKey(
    app().assets,
    storyId,
    story.world,
    assetFileName(diskName, 'image'),
  )
  if (!key) return undefined
  const bytes = await readAssetBytes(app().assets, key)
  if (!bytes) return undefined
  return uploadPrunaFile(bytes, assetFileName(diskName, 'image'))
}

export async function generateStoryVideo(
  story: Story,
  name: string,
  prompt: Record<string, unknown>,
  opts: { firstFrame?: string; lastFrame?: string; duration?: number } = {},
): Promise<string> {
  const storyId = story.id
  const started = performance.now()
  const fullPrompt = promptWithStyle(story, prompt)
  const duration = opts.duration ?? VIDEO_DEFAULT_SECONDS
  console.error('video gen start', { storyId, name, duration })
  try {
    const imageUrl = opts.firstFrame
      ? await uploadFrame(story, opts.firstFrame)
      : undefined
    const lastFrameUrl = opts.lastFrame
      ? await uploadFrame(story, opts.lastFrame)
      : undefined
    const buffer = await generatePrunaVideo(fullPrompt, imageUrl, duration, lastFrameUrl)
    await writeAsset(
      app().assets,
      storyKey(storyId, assetFileName(name, 'video')),
      new Uint8Array(buffer),
      'video/mp4',
    )
    const url = assetUrl(storyId, name, 'video')
    console.error('video gen ok', {
      storyId,
      name,
      url,
      bytes: buffer.byteLength,
      ms: Math.round(performance.now() - started),
    })
    return url
  } catch (error) {
    console.error('video gen error', {
      storyId,
      name,
      ms: Math.round(performance.now() - started),
      error: errorMessage(error),
    })
    throw error
  }
}

async function generateCartesiaVoiceSse(
  transcript: string,
  voiceId: string,
): Promise<{ wav: Uint8Array; words: string[]; t: number[] }> {
  const apiKey = app().env.CARTESIA_API_KEY?.trim()
  if (!apiKey) throw new Error('CARTESIA_API_KEY is required for voice gen')
  const text = transcript.trim()
  if (!text) throw new Error('Empty transcript for voice gen')
  const response = await fetch('https://api.cartesia.ai/tts/sse', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Cartesia-Version': '2026-03-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: 'sonic-3.6',
      transcript: text,
      voice: voiceId,
      output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: 44100 },
      add_timestamps: true,
      use_normalized_timestamps: true,
    }),
  })
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500)
    throw new Error(`Cartesia error: ${response.status} ${body}`)
  }
  if (!response.body) throw new Error('Cartesia SSE returned no body')

  const pcmParts: Uint8Array[] = []
  const words: string[] = []
  const t: number[] = []

  const handleEvent = (data: string): boolean => {
    if (data === '[DONE]') return false
    let parsed: {
      type?: unknown
      data?: unknown
      word_timestamps?: { words?: unknown; start?: unknown }
      title?: unknown
      message?: unknown
    }
    try {
      parsed = JSON.parse(data) as typeof parsed
    } catch {
      throw new Error(`Cartesia SSE returned non-JSON: ${data.slice(0, 200)}`)
    }
    switch (parsed.type) {
      case 'chunk': {
        if (typeof parsed.data === 'string' && parsed.data) {
          pcmParts.push(decodeBase64(parsed.data))
        }
        return false
      }
      case 'timestamps': {
        const wt = parsed.word_timestamps
        const nextWords = Array.isArray(wt?.words) ? wt.words : []
        const nextStart = Array.isArray(wt?.start) ? wt.start : []
        for (let i = 0; i < nextWords.length; i++) {
          const word = nextWords[i]
          const start = nextStart[i]
          if (typeof word !== 'string' || typeof start !== 'number') continue
          words.push(word)
          t.push(Math.round(start * 1000))
        }
        return false
      }
      case 'phoneme_timestamps':
        return false
      case 'done':
        return true
      case 'error': {
        const detail =
          typeof parsed.message === 'string'
            ? parsed.message
            : typeof parsed.title === 'string'
              ? parsed.title
              : data.slice(0, 200)
        throw new Error(`Cartesia SSE error: ${detail}`)
      }
      default:
        return false
    }
  }

  for await (const data of sseData(response.body)) {
    if (handleEvent(data)) break
  }

  if (pcmParts.length === 0) throw new Error('Cartesia SSE returned no audio')
  return { wav: pcmS16leToWav(concatBytes(pcmParts)), words, t }
}

function pcmS16leToWav(pcm: Uint8Array, sampleRate = 44100): Uint8Array {
  const buffer = new ArrayBuffer(44 + pcm.byteLength)
  const view = new DataView(buffer)
  const out = new Uint8Array(buffer)
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + pcm.byteLength, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, pcm.byteLength, true)
  out.set(pcm, 44)
  return out
}

export async function generateStoryVoice(
  storyId: string,
  voice: string,
  caption: string,
): Promise<Speech> {
  const key = speechFileName(voice, caption)
  const started = performance.now()
  const voiceId = resolveVoiceId(voice)
  if (!voiceId)
    throw new Error(`Unknown voice "${voice}". Use one of ${VOICE_NAMES.join(', ')}`)
  const transcript = captionToTranscript(caption)
  console.error('voice gen start', { storyId, key, voice })
  try {
    const { wav, words, t } = await generateCartesiaVoiceSse(transcript, voiceId)
    await writeAsset(app().assets, storyKey(storyId, key), wav, 'audio/wav')
    console.error('voice gen ok', {
      storyId,
      key,
      bytes: wav.byteLength,
      words: words.length,
      ms: Math.round(performance.now() - started),
    })
    return words.length > 0 ? { key, words, t } : { key }
  } catch (error) {
    console.error('voice gen error', {
      storyId,
      key,
      ms: Math.round(performance.now() - started),
      error: errorMessage(error),
    })
    throw error
  }
}

async function fetchAssetBytes(url: string, headers: HeadersInit): Promise<ArrayBuffer> {
  const response = await fetch(url, { headers })
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500)
    throw new Error(`Pruna download error: ${response.status} ${body}`)
  }
  return response.arrayBuffer()
}
