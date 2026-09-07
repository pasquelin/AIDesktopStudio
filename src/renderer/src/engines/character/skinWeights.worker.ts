/// <reference lib="webworker" />
/**
 * Wiring only, like `audio.worker.ts`: everything that can be reasoned about lives in
 * `skinVertices.ts`, which needs no worker to be measured.
 *
 * What IS here and nowhere else: coming back for air between slices. A worker reads its message
 * queue only between tasks, so a cancellation sent during one long synchronous walk would sit
 * unread until the walk it was meant to stop had finished.
 */
import { messageOf } from '@shared/guards'
import { isCancel, type SkinIncoming, type SkinRequest, type SkinResponse } from './skinMessage'
import { emptyBinding, skinRange, vertexCountOf } from './skinVertices'
import { loadSkinVerticesWasm } from './skinVerticesWasm'
import { breathe } from '../core/breathe'
import { createCancelRegistry } from '../core/cancelRegistry'

declare const self: DedicatedWorkerGlobalScope

/** Vertices per slice. Small enough that a cancellation lands promptly on a slow machine. */
const SLICE = 4096

const cancels = createCancelRegistry()

/**
 * Compiled on the first request, never at module load: nothing awaits it until then, so a
 * rejection would reach `unhandledrejection` before any `try` existed to swallow it.
 */
let wasmBinding: ReturnType<typeof loadSkinVerticesWasm> | null = null

self.addEventListener('message', (event: MessageEvent<SkinIncoming>) => {
  const message = event.data
  if (isCancel(message)) {
    cancels.cancel(message.id)
    return
  }
  cancels.start(message.id)
  void run(message)
})

async function run(request: SkinRequest): Promise<void> {
  try {
    const { fallback, vertices, wasm } = await bindingFor(request)

    for (let from = 0; from < vertices; from += SLICE) {
      if (cancels.stopped(request.id)) return

      const to = Math.min(from + SLICE, vertices)
      if (wasm) wasm.skinRange(from, to)
      else if (fallback) skinRange(request, fallback, from, to)
      post({ id: request.id, done: false, progress: from / Math.max(vertices, 1) })
      // Yields the queue: without it every cancel and every progress message would be delivered
      // in one burst once the whole walk was already over.
      await breathe()
    }

    // Checked once more: the last slice may have run while a cancel was on its way.
    if (cancels.stopped(request.id)) return

    const binding = wasm ? wasm.binding() : fallback
    if (!binding) throw new Error('Skinning produced no binding')
    self.postMessage({ id: request.id, done: true, ok: true, ...binding } satisfies SkinResponse, {
      transfer: [binding.skinIndex.buffer, binding.skinWeight.buffer],
    })
  } catch (error) {
    post({ id: request.id, done: true, ok: false, error: messageOf(error) })
  } finally {
    cancels.finish(request.id)
  }
}

async function bindingFor(request: SkinRequest) {
  const vertices = vertexCountOf(request)
  try {
    const wasm = (await (wasmBinding ??= loadSkinVerticesWasm()))(request)
    return { fallback: undefined, vertices, wasm }
  } catch {
    return { fallback: emptyBinding(vertices), vertices, wasm: undefined }
  }
}

function post(response: SkinResponse): void {
  self.postMessage(response)
}
