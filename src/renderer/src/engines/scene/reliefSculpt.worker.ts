/// <reference lib="webworker" />
import { messageOf } from '@shared/guards'
import { applyReliefSculpt, changedChunks } from '@shared/domain/relief'
import type { ReliefSculptRequest, ReliefSculptResponse } from './reliefSculptMessage'

declare const self: DedicatedWorkerGlobalScope

/**
 * raiseDisk never reads sample values. Smooth and flatten send the grid on the request;
 * absent, this empty field keeps the historical raiseDisk path.
 */
const NO_VALUES = new Float32Array(0)
let base: { id: number; width: number; height: number; values: Float32Array } | null = null

self.addEventListener('message', (event: MessageEvent<ReliefSculptRequest>) => run(event.data))

function run(request: ReliefSculptRequest): void {
  try {
    const { id, width, height, extent, grain, sculpt, operation, rows, overlays } = request
    const after = applyReliefSculpt(
      { width, height, values: valuesOf(request) },
      extent,
      sculpt,
      operation,
      grain,
      rows,
      overlays,
      request.overlayAlpha === undefined
        ? undefined
        : { alpha: request.overlayAlpha, mask: request.overlayMask },
    )
    const chunks = changedChunks(sculpt, after)
    self.postMessage({ id, ok: true, grain, chunks } satisfies ReliefSculptResponse)
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: messageOf(error),
    } satisfies ReliefSculptResponse)
  }
}

function valuesOf(request: ReliefSculptRequest): Float32Array {
  const { baseId, values, width, height } = request
  if (baseId === undefined) return NO_VALUES
  if (values) base = { id: baseId, width, height, values }
  if (base?.id === baseId && base.width === width && base.height === height) return base.values
  throw new Error('relief sculpt base heightfield is unavailable')
}
