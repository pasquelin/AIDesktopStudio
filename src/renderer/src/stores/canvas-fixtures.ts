import {
  DEFAULT_CANVAS,
  layerById,
  type CanvasState,
  type Layer,
} from '@/engines/canvas/canvasState'
import type { CanvasHost } from '@/features/image/canvasHosts'
import { canvasOf, canvasStore, useCanvases } from './canvases'
import { installIn } from './document-fixtures'

/**
 * Puts an image document in front of a panel under test, in a store put back as it was built.
 *
 * Lives beside the stores rather than beside `layerFixture` for the same reason `installScene`
 * does: `engines/` must not reach for a store.
 */
/** A whole `CanvasHost` that answers nothing, so a suite states only the member it exercises. */
export function canvasHostStub(overrides: Partial<CanvasHost> = {}): CanvasHost {
  return {
    pixelSnapshots: async () => [],
    restoreSnapshot: async () => {},
    flatten: async () => null,
    flattenBitmap: async () => null,
    snapshot: async () => null,
    layerSnapshot: async () => null,
    outlineMaskSnapshot: async () => null,
    forgetPicture: async () => {},
    turnQuarter: () => {},
    paintCells: () => false,
    ...overrides,
  }
}

export function installCanvas(documentId: string, state: CanvasState = DEFAULT_CANVAS): void {
  installIn(canvasStore, documentId, state, 'image')
}

/**
 * Reading half of `installCanvas`, for what a suite asserts BETWEEN renders.
 *
 * Where the scene answers `null` for a document the store lost, this one falls back to the DEFAULT
 * canvas — which holds exactly one layer, `layer-1`. So a lost document answers `Background` under
 * that id and `null` under any other, `layer-2` included: neither answer tells a lost document
 * apart from a missing layer, and an isolation assertion needs its own non-null guard.
 */
export const layerNow = (documentId: string, id: string): Layer | null =>
  layerById(canvasOf(useCanvases.getState(), documentId), id)
