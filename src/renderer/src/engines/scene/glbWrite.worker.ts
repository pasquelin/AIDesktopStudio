/// <reference lib="webworker" />
/**
 * Wiring only, like `skinWeights.worker.ts`: the whole of the writing is in `glbSkin.ts`, which
 * needs no worker to be measured.
 *
 * Here because of what it costs: a character of 1.4 million triangles is a file of tens of
 * megabytes, and rebuilding its container on the UI thread is the stutter invariant 6 sends away.
 */
import { messageOf } from '@shared/guards'
import { glbSkinFaultOf, glbWithSkin } from './glbSkin'
import {
  isGlbWriteCancel,
  type GlbWriteIncoming,
  type GlbWriteRequest,
  type GlbWriteResponse,
} from './glbWriteMessage'

declare const self: DedicatedWorkerGlobalScope

const cancelled = new Set<number>()

self.addEventListener('message', (event: MessageEvent<GlbWriteIncoming>) => {
  const message = event.data
  if (isGlbWriteCancel(message)) {
    cancelled.add(message.id)
    return
  }
  run(message)
})

function run(request: GlbWriteRequest): void {
  try {
    // Asked before a byte is written, so a file this pass cannot patch is NAMED rather than half
    // rewritten — a `.glb` linked by index is broken by a partial pass, not half right.
    const fault = glbSkinFaultOf(request.file, request)
    if (fault) {
      post({ id: request.id, done: true, ok: false, error: fault })
      return
    }

    const file = glbWithSkin(request.file, request)
    if (cancelled.delete(request.id)) return

    self.postMessage({ id: request.id, done: true, ok: true, file } satisfies GlbWriteResponse, {
      transfer: [file.buffer as ArrayBuffer],
    })
  } catch (error) {
    post({ id: request.id, done: true, ok: false, error: messageOf(error) })
  }
}

function post(response: GlbWriteResponse): void {
  self.postMessage(response)
}
