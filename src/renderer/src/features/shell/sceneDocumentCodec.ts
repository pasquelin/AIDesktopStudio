import type { SceneState } from '@/engines/scene/sceneState'
import SceneDocumentWorker from './sceneDocumentCodec.worker?worker'
import type {
  SceneDocumentCodecRequest,
  SceneDocumentCodecResponse,
} from './sceneDocumentCodecMessage'
import { traceFailure } from '@/services/diagnostics'
import { scenePayloadOf } from './sceneDocument'
import { yieldSceneDocument } from './sceneDocumentYield'

type CodecOptions = {
  nodes: number
  chunkNodes: number
  timeoutMs: number
  yieldWork: () => Promise<void>
}
type Pending = {
  content: string[]
  nextIndex: number
  resolve: (content: string) => void
  reject: (error: Error) => void
  signal?: AbortSignal
  abort?: () => void
  timer: ReturnType<typeof setTimeout>
}

const LARGE_SCENE: CodecOptions = {
  nodes: 20_000,
  chunkNodes: 512,
  timeoutMs: 30_000,
  yieldWork: yieldSceneDocument,
}

export type SceneDocumentCodec = {
  encode: (state: SceneState, documentId: string, signal?: AbortSignal) => Promise<string>
  dispose: () => void
}

export function createSceneDocumentCodec(
  spawn: () => Worker,
  options: CodecOptions = LARGE_SCENE,
): SceneDocumentCodec {
  const waiting = new Map<number, Pending>()
  let worker: Worker | null = null
  let nextId = 0
  let gone = false
  const encoding = new Map<string, Promise<void>>()

  const failWorker = (failed: Worker, reason: string): void => {
    if (worker !== failed) return
    failed.terminate()
    worker = null
    for (const id of [...waiting.keys()]) rejectPending(waiting, id, new Error(reason))
  }

  const workerOf = (): Worker => {
    if (gone) throw abortError()
    if (worker) return worker
    const started = spawn()
    started.addEventListener('message', (event: MessageEvent<SceneDocumentCodecResponse>) =>
      acceptResponse(waiting, event.data),
    )
    started.addEventListener('error', event =>
      failWorker(started, `scene document worker failed: ${event.message}`),
    )
    started.addEventListener('messageerror', () =>
      failWorker(started, 'scene document worker sent an unreadable answer'),
    )
    worker = started
    return started
  }

  const post = (message: SceneDocumentCodecRequest): void => {
    try {
      workerOf().postMessage(message)
    } catch (error) {
      if (worker) {
        failWorker(worker, `scene document worker rejected a chunk: ${errorOf(error).message}`)
      } else rejectPending(waiting, message.id, errorOf(error))
    }
  }

  const encodeLarge = async (
    state: SceneState,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<string> => {
    if (signal?.aborted || gone) throw abortError()
    const { nodes, ...rest } = state
    const id = (nextId += 1)
    const answer = new Promise<string>((resolve, reject) => {
      // Only THIS request: terminating the worker rejected every other document's save in
      // flight, for a slowness none of them caused.
      const timer = setTimeout(() => {
        try {
          worker?.postMessage({ id, cancel: true } satisfies SceneDocumentCodecRequest)
        } catch {
          // Nothing to do about a worker that will not take a cancel; the request is rejected.
        }
        rejectPending(waiting, id, new Error('scene document worker timed out'))
      }, options.timeoutMs)
      const pending: Pending = { content: [], nextIndex: 0, resolve, reject, signal, timer }
      const abort = (): void => {
        if (!waiting.has(id)) return
        try {
          worker?.postMessage({ id, cancel: true } satisfies SceneDocumentCodecRequest)
        } catch {
          // The pending request is rejected below; a dead worker is replaced on the next save.
        }
        rejectPending(waiting, id, abortError())
      }
      pending.abort = abort
      waiting.set(id, pending)
      signal?.addEventListener('abort', abort, { once: true })
    })
    post({ id, operation: 'encodeStart', state: rest, documentId })
    let index = 0
    for (let at = 0; at < nodes.length && waiting.has(id); at += options.chunkNodes) {
      const end = Math.min(at + options.chunkNodes, nodes.length)
      post({
        id,
        operation: 'encodeNodes',
        index,
        nodes: nodes.slice(at, end),
        done: end === nodes.length,
      })
      index += 1
      if (end < nodes.length) await options.yieldWork()
    }
    return await answer
  }

  /**
   * The window's thread is the fallback, never a refusal. A worker that will not start, dies or
   * times out used to leave a large scene with no way to be written at all; 20 000 nodes cost
   * 21 ms here, measured 2026-09-05, and 100 000 cost 98 ms.
   */
  const encodeOffThreadOrHere = async (
    state: SceneState,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<string> => {
    try {
      return await encodeLarge(state, documentId, signal)
    } catch (error) {
      if (signal?.aborted || gone || isAbortError(error)) throw error
      // Not a surface: the save went through, and only whoever reads the log needs to know the
      // worker was skipped — a toast per save would say nothing the person can act on.
      traceFailure('shell.dropped', `scene document worker for ${documentId}`, error)
      return JSON.stringify(scenePayloadOf(state, documentId))
    }
  }

  const queuedEncode = (
    state: SceneState,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<string> => {
    const result = after(encoding.get(documentId) ?? Promise.resolve(), () =>
      signal?.aborted || gone
        ? Promise.reject(abortError())
        : !shouldEncodeOffThread(state, options)
          ? Promise.resolve(JSON.stringify(scenePayloadOf(state, documentId)))
          : encodeOffThreadOrHere(state, documentId, signal),
    )
    const tail = ignoreFailure(result)
    encoding.set(documentId, tail)
    void forgetQueue(encoding, documentId, tail)
    return result
  }

  return {
    encode: async (state, documentId, signal) => await queuedEncode(state, documentId, signal),
    dispose: () => {
      gone = true
      worker?.terminate()
      worker = null
      for (const id of [...waiting.keys()]) rejectPending(waiting, id, abortError())
    },
  }
}

// Only the NODES are chunked; everything else crosses in one `encodeStart` clone. These bounds
// keep that single clone small — they are a guess, not a measurement.
function shouldEncodeOffThread(state: SceneState, options: CodecOptions): boolean {
  if (state.nodes.length < options.nodes) return false
  if (state.world.layers.length > 100 || state.animation.tracks.length > 2_000) return false
  return !state.animation.tracks.some(track => track.keys.length > 5_000)
}

async function after<T>(pending: Promise<void>, run: () => Promise<T>): Promise<T> {
  await pending
  return await run()
}

async function ignoreFailure(pending: Promise<unknown>): Promise<void> {
  try {
    await pending
  } catch {
    // A failed conversion must not block the next save.
  }
}

async function forgetQueue(
  queues: Map<string, Promise<void>>,
  documentId: string,
  tail: Promise<void>,
): Promise<void> {
  await tail
  if (queues.get(documentId) === tail) queues.delete(documentId)
}

function acceptResponse(waiting: Map<number, Pending>, response: SceneDocumentCodecResponse): void {
  const pending = waiting.get(response.id)
  if (!pending) return
  if (!response.done) {
    if (response.index !== pending.nextIndex) {
      rejectPending(
        waiting,
        response.id,
        new Error(`scene document worker returned chunk ${response.index} out of order`),
      )
      return
    }
    pending.nextIndex += 1
    pending.content.push(response.content)
    return
  }
  if (response.ok) {
    const content = pending.content.join('')
    if (response.chunks !== pending.nextIndex || response.characters !== content.length) {
      rejectPending(
        waiting,
        response.id,
        new Error('scene document worker returned an incomplete file'),
      )
      return
    }
    settlePending(waiting, response.id, content)
  } else rejectPending(waiting, response.id, new Error(response.error))
}

function settlePending(waiting: Map<number, Pending>, id: number, content: string): void {
  const pending = waiting.get(id)
  if (!pending) return
  waiting.delete(id)
  clearTimeout(pending.timer)
  if (pending.abort) pending.signal?.removeEventListener('abort', pending.abort)
  pending.resolve(content)
}

function rejectPending(waiting: Map<number, Pending>, id: number, error: Error): void {
  const pending = waiting.get(id)
  if (!pending) return
  waiting.delete(id)
  clearTimeout(pending.timer)
  if (pending.abort) pending.signal?.removeEventListener('abort', pending.abort)
  pending.reject(error)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function abortError(): DOMException {
  return new DOMException('scene document conversion was cancelled', 'AbortError')
}

function errorOf(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export const sceneDocumentCodec = createSceneDocumentCodec(() => new SceneDocumentWorker())
