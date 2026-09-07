/**
 * What crosses to the relief sculpt worker and back. Own file so both sides read the same
 * contract — the same reason `csgMessage.ts` exists.
 */
import type {
  PackedReliefChunk,
  ReliefExtent,
  ReliefChunkRows,
  ReliefMask,
  ReliefOverlay,
  ReliefSculpt,
  ReliefSculptOperation,
} from '@shared/domain/relief'

export type ReliefSculptRequest = {
  id: number
  width: number
  height: number
  extent: ReliefExtent
  grain: number
  sculpt: ReliefSculpt | undefined
  operation: ReliefSculptOperation
  rows?: ReliefChunkRows
  /** Identity of the base heightfield kept by this worker for smooth and flatten. */
  baseId?: number
  /** Base heightfield, sent only when `baseId` is first bound on this worker. */
  values?: Float32Array
  /** Enabled overlays other than the armed sculpt, so combined height sees them. */
  overlays?: readonly ReliefOverlay[]
  overlayAlpha?: number
  overlayMask?: ReliefMask
}

/**
 * The dirtied chunks in the form the DOCUMENT holds them, base64 and all. Decoding them here to
 * transfer a `Float32Array` cost the worker a decode and the UI thread the re-encode after it,
 * for a payload the surface decodes again to draw — `reliefSculptCost.test.ts`.
 */
export type ReliefSculptResponse =
  | { id: number; ok: true; grain: number; chunks: PackedReliefChunk[] }
  | { id: number; ok: false; error: string }
