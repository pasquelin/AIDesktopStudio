import { cellOf } from '@/engines/canvas/pixelGrid'
import type { Rect } from '@/engines/canvas/canvasState'
import { fakeCanvas } from '@/features/image/canvasHost-fixtures'
import { holdCanvas } from '@/features/image/canvasHosts'
import { newId } from '@/helpers/ids'
import { pixelPort } from '@/features/image/pixelPort'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { followDocuments } from './followDocuments'

/** What a cell holds once something has been laid on it — `null` where a call erased. */
export type PaintedCells = Map<string, number | null>

const at = (x: number, y: number): string => `${x},${y}`

/**
 * 🛑 The SURFACE a headless run has not got: `holdCanvas` is called by `ImageDocument`, and no
 * window mounts one here — so `canvasHost` answers nothing and every `canvas.drawPixels` would be
 * refused, turning a whole section red while blaming the model.
 *
 * What stands in is a PORT and never a rule: the cells it records come from `pixelGrid`, the
 * production arithmetic, and the history entry goes through `pixelPort(...).record` — the very
 * line `ImageDocument` wires. Nothing of the studio is re-implemented. The rest of the port is
 * `fakeCanvas`: a save and an export read their pixels off it, and with none both refused.
 */
export function followTheCanvas(painted: PaintedCells): () => void {
  return followDocuments(
    document => document.kind === 'image',
    documentId => {
      const port = pixelPort(documentId, () => ({ restorePixels: () => true }))
      const host = fakeCanvas({
        paintCells: (_layerId: string | null, rects: readonly Rect[], color: number | null) => {
          const cell = canvasOf(useCanvases.getState(), documentId).pixelCell
          if (cell === null) return false

          for (const rect of rects) {
            painted.set(at(cellOf(rect.x, cell), cellOf(rect.y, cell)), color)
          }
          port.record(newId())
          return true
        },
      })

      return holdCanvas(documentId, () => host)
    },
  )
}
