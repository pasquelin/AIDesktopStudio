import { writeFile } from 'node:fs/promises'
import { linesOf } from '@main/netStream'
import { assistantProgress, type AssistantProgress } from '@shared/domain/assistant'
import type { DownloadProgress } from '@shared/domain/localModel'
import { ollamaModel, type OllamaTag } from '@shared/domain/ollamaModel'
import { isRecord } from '@shared/guards'
import type { ChatRequest, LocalRuntime } from './localRuntimes'

type OllamaImageRequest = {
  readonly model: string
  readonly prompt: string
  readonly width?: number
  readonly height?: number
  readonly steps?: number
  readonly seed?: number
  readonly onProgress: (ratio: number) => void
  readonly signal?: AbortSignal
}

export type OllamaPort = {
  tags: () => Promise<readonly OllamaTag[]>
  pull: (
    name: string,
    onProgress: (progress: DownloadProgress) => void,
    signal: AbortSignal,
  ) => Promise<void>
  remove: (name: string) => Promise<void>
  chat: (request: ChatRequest) => Promise<string>
  generateImage: (request: OllamaImageRequest) => Promise<readonly string[]>
}

const ORIGIN = 'http://127.0.0.1:11434'
const TAGS_MS = 2_000
const DOWN_MS = 10_000
const FRESH_MS = 3_000

/** Ollama answers a stream as one JSON object per line. A truncated last frame is ordinary. */
async function* eventsOf(body: ReadableStream<Uint8Array> | null): AsyncIterable<unknown> {
  for await (const line of linesOf(body)) {
    if (line.trim() === '') continue
    try {
      yield JSON.parse(line)
    } catch {
      // A truncated frame is ordinary on a cancelled pull.
    }
  }
}

/**
 * The window a tag was built with, read from where `/api/tags` already publishes it.
 *
 * 🛑 No second call: `/api/show` answers the same figure and costs a round trip per model.
 * Measured on 2026-08-28 — `qwen3.8:latest` and `qwen3-coder:30b` both answer 262 144 here.
 */
function windowOf(details: unknown): { contextTokens?: number } {
  if (!isRecord(details)) return {}

  const held = details.context_length
  return typeof held === 'number' && held > 0 ? { contextTokens: held } : {}
}

/** A count this door publishes only on its last frame, absent everywhere else. */
const countIn = (frame: Record<string, unknown>, key: string): number | undefined =>
  typeof frame[key] === 'number' ? frame[key] : undefined

function chatProgressIn(frame: unknown): AssistantProgress | null {
  if (!isRecord(frame)) return null

  const said = isRecord(frame.message) ? frame.message.content : undefined
  return assistantProgress(
    typeof said === 'string' ? said : '',
    countIn(frame, 'prompt_eval_count'),
    countIn(frame, 'eval_count'),
  )
}

function chatBody(request: ChatRequest): string {
  return JSON.stringify({
    model: request.model,
    messages: request.messages,
    stream: request.onProgress !== undefined,
    keep_alive: '5m',
    options: {
      num_ctx: request.contextTokens,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(request.topP === undefined ? {} : { top_p: request.topP }),
      ...(request.maxTokens === undefined ? {} : { num_predict: request.maxTokens }),
    },
    ...(request.json ? { format: 'json' } : {}),
  })
}

async function chatText(response: Response, request: ChatRequest): Promise<string> {
  const watching = request.onProgress
  if (!watching) return chatProgressIn(await response.json())?.delta ?? ''

  let written = ''
  for await (const frame of eventsOf(response.body)) {
    const progress = chatProgressIn(frame)
    if (progress === null) continue
    written += progress.delta
    watching(progress)
  }
  return written
}

export function ollamaHttpPort(origin = ORIGIN, send: typeof fetch = fetch): OllamaPort {
  const url = (path: string) => `${origin}${path}`

  return {
    tags: async () => {
      const response = await send(url('/api/tags'), { signal: AbortSignal.timeout(TAGS_MS) })
      if (!response.ok) throw new Error(`ollama /api/tags ${response.status}`)

      const body: unknown = await response.json()
      const models = isRecord(body) && Array.isArray(body.models) ? body.models : []

      return models.flatMap((entry: unknown): OllamaTag[] => {
        if (!isRecord(entry)) return []
        const { name, size } = entry
        if (typeof name !== 'string' || name === '' || typeof size !== 'number') return []
        const capabilities = Array.isArray(entry.capabilities)
          ? entry.capabilities.filter((cap): cap is string => typeof cap === 'string')
          : undefined
        return [
          {
            name,
            size,
            ...(capabilities && capabilities.length > 0 ? { capabilities } : {}),
            ...windowOf(entry.details),
          },
        ]
      })
    },

    pull: async (name, onProgress, signal) => {
      const response = await send(url('/api/pull'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: name, stream: true }),
        signal,
      })
      if (!response.ok) throw new Error(`ollama /api/pull ${response.status}`)

      for await (const event of eventsOf(response.body)) {
        if (!isRecord(event) || typeof event.total !== 'number') continue
        onProgress({
          received: typeof event.completed === 'number' ? event.completed : 0,
          total: event.total,
        })
      }
    },

    remove: async name => {
      const response = await send(url('/api/delete'), {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: name }),
      })
      if (!response.ok) throw new Error(`ollama /api/delete ${response.status}`)
    },

    // 🛑 Streamed only for a watcher: `localJobRunner` and the image door call this too, and
    // hundreds of small `JSON.parse` for an answer nobody reads is work paid for nothing.
    chat: async request => {
      const response = await send(url('/api/chat'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: chatBody(request),
        signal: request.signal,
      })
      if (!response.ok) throw new Error(`ollama /api/chat ${response.status}`)

      // 🛑 Not the streamed reader on a whole body: this door answers ONE object, and nothing
      // promises it on one line — every line failing to parse would answer the empty string.
      return chatText(response, request)
    },

    generateImage: async request => {
      const response = await send(url('/api/generate'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: request.model,
          prompt: request.prompt,
          stream: true,
          ...(request.width !== undefined ? { width: request.width } : {}),
          ...(request.height !== undefined ? { height: request.height } : {}),
          ...(request.steps !== undefined ? { steps: request.steps } : {}),
          ...(request.seed !== undefined ? { options: { seed: request.seed } } : {}),
        }),
        signal: request.signal,
      })
      if (!response.ok) throw new Error(`ollama /api/generate ${response.status}`)

      let images: string[] = []
      for await (const event of eventsOf(response.body)) {
        if (!isRecord(event)) continue
        const total = typeof event.total === 'number' ? event.total : null
        const completed = typeof event.completed === 'number' ? event.completed : 0
        if (total !== null && total > 0) request.onProgress(completed / total)
        if (Array.isArray(event.images)) {
          images = event.images.filter((one): one is string => typeof one === 'string')
        }
      }
      return images
    },
  }
}

export type OllamaRuntimeHooks = {
  /** Starts the service if it is already on this machine. Absent: the studio does not start it. */
  ensure?: () => Promise<boolean>
  /** A listing just went stale — a tag deleted outside, a chat that found nothing. Never a delete. */
  onStale?: () => void
  writeFile?: (path: string, bytes: Uint8Array) => Promise<void>
}

function intOf(fields: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = fields[key]
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined
}

/**
 * Ollama as a runtime. Starting is `ensure`'s job; this runtime never stops or uninstalls it.
 */
export function ollamaLocalRuntime(port: OllamaPort, hooks: OllamaRuntimeHooks = {}): LocalRuntime {
  let inflight: Promise<readonly OllamaTag[]> | null = null
  let lastOk: { at: number; tags: readonly OllamaTag[] } | null = null
  let downAt: number | null = null

  function remember(tags: readonly OllamaTag[]): readonly OllamaTag[] {
    lastOk = { at: Date.now(), tags }
    downAt = null
    return tags
  }

  async function fetchTags(): Promise<readonly OllamaTag[]> {
    try {
      return remember(await port.tags())
    } catch (error: unknown) {
      if (hooks.ensure && (await hooks.ensure())) {
        try {
          return remember(await port.tags())
        } catch {
          // Still down after a start: mark it, same as the first refusal.
        }
      }
      downAt = Date.now()
      lastOk = null
      throw error
    }
  }

  function listed(): Promise<readonly OllamaTag[]> {
    const now = Date.now()
    if (downAt !== null && now - downAt < DOWN_MS) return Promise.reject(new Error('ollama down'))
    if (lastOk !== null && now - lastOk.at < FRESH_MS) return Promise.resolve(lastOk.tags)
    if (inflight) return inflight

    inflight = fetchTags().finally(() => {
      inflight = null
    })
    return inflight
  }

  function forgetTags(): void {
    lastOk = null
    downAt = null
    inflight = null
  }

  return {
    discover: async () => {
      try {
        return (await listed()).flatMap(tag => {
          const model = ollamaModel(tag)
          return model ? [model] : []
        })
      } catch {
        return []
      }
    },

    read: async models => {
      try {
        const names = new Set((await listed()).map(tag => tag.name))
        return {
          ready: true,
          installed: new Set(models.filter(model => names.has(model.id)).map(model => model.id)),
          loaded: new Set(),
        }
      } catch {
        return { ready: false, installed: new Set(), loaded: new Set() }
      }
    },

    install: async (model, onProgress, signal) => {
      forgetTags()
      await port.pull(model.id, onProgress, signal)
      forgetTags()
    },
    remove: async model => {
      forgetTags()
      await port.remove(model.id)
      forgetTags()
    },
    chat: async request => {
      try {
        return await port.chat(request)
      } catch (error: unknown) {
        forgetTags()
        hooks.onStale?.()
        throw error
      }
    },
    generate: async request => {
      if (request.modality !== 'image') {
        throw new Error(`${request.modality} is not an image this runtime draws`)
      }
      try {
        const images = await port.generateImage({
          model: request.model,
          prompt: request.prompt,
          width: intOf(request.fields, 'width'),
          height: intOf(request.fields, 'height'),
          steps: intOf(request.fields, 'steps'),
          seed: intOf(request.fields, 'seed'),
          onProgress: request.onProgress,
          signal: request.signal,
        })
        const [encoded] = images
        if (encoded === undefined) throw new Error('ollama returned no image')
        const bytes = Buffer.from(encoded, 'base64')
        await (hooks.writeFile ?? writeFile)(request.destination, bytes)
        return { path: request.destination, device: 'local', backend: 'ollama' }
      } catch (error: unknown) {
        forgetTags()
        hooks.onStale?.()
        throw error
      }
    },
  }
}
