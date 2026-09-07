import { createWorkerPort } from '../core/workerPort'
import { writeBuffers, type GlbWriteRequest, type GlbWriteResponse } from './glbWriteMessage'
import type { GlbSkinPatch } from './glbSkin'

export type GlbWriter = {
  /** `null` means the request was taken back, or the port let go while it was out. */
  write: (
    file: Uint8Array,
    patch: GlbSkinPatch,
    watch?: { signal?: AbortSignal },
  ) => Promise<Uint8Array | null>
  dispose: () => void
}

/**
 * The port onto the glb-writing worker: a character's own file, with its skeleton put into it.
 *
 * A file this pass cannot patch comes back NAMED rather than half written — a `.glb` is linked by
 * index, and half a pass over one gives a broken file, not a half-right one.
 */
export function createGlbWriter(spawn: () => Worker): GlbWriter {
  const port = createWorkerPort<Uint8Array, GlbWriteResponse>(spawn, 'glb-write', answer =>
    answer.ok ? answer.file : new Uint8Array(),
  )

  return {
    write: (file, patch, watch) =>
      port.send(id => {
        const request: GlbWriteRequest = { id, file, ...patch, skins: [...patch.skins] }
        return { message: request, transfer: writeBuffers(request) }
      }, watch),

    dispose: port.dispose,
  }
}
