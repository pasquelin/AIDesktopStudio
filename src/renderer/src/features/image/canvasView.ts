import { RULER_SIZE } from '@/engines/canvas/CanvasOverlay'
import {
  centerOn,
  fitTo,
  nextZoom,
  previousZoom,
  zoomCanvasAt,
  type Viewport,
} from '@/engines/canvas/viewport'
import type { Size } from '@/engines/core/geometry'
import { clearGuides as clearGuidesCommand } from '@/engines/canvas/commands'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { hostOf, useCanvasViews, canvasViewOf, type ViewToggle } from '@/stores/canvasViews'

/**
 * Navigating an image document, from wherever the gesture comes: the zoom bar or a key. Written
 * once here rather than in each of them — a zoom step that centres differently depending on
 * which button was pressed is a bug nobody thinks to look for.
 */

/**
 * The panel this document is shown in, and how much of its top-left corner the rulers cover.
 * `null` before the engine has measured anything: a zoom command with no panel to zoom inside
 * has no honest answer other than doing nothing — computed anyway, it lands at 2% in a corner.
 */
function panel(documentId: string): { host: Size; inset: number } | null {
  const views = useCanvasViews.getState()
  const host = hostOf(views, documentId)
  if (host.width === 0 || host.height === 0) return null
  return { host, inset: canvasViewOf(views, documentId).rulers ? RULER_SIZE : 0 }
}

function reframe(documentId: string, change: (viewport: Viewport) => Viewport): void {
  const views = useCanvasViews.getState()
  views.setViewport(documentId, change(canvasViewOf(views, documentId).viewport))
}

/**
 * Around the middle of what can actually be seen — a key press has no pointer to zoom towards,
 * and the middle of the host is not the middle of the view when the rulers take a bite out of it.
 */
function step(documentId: string, pick: (scale: number, integral: boolean) => number): void {
  const measured = panel(documentId)
  if (!measured) return

  const anchor = {
    x: (measured.inset + measured.host.width) / 2,
    y: (measured.inset + measured.host.height) / 2,
  }
  const cell = canvasOf(useCanvases.getState(), documentId).pixelCell
  reframe(documentId, viewport =>
    zoomCanvasAt(viewport, pick(viewport.scale, cell !== null), anchor),
  )
}

export function zoomIn(documentId: string): void {
  step(documentId, nextZoom)
}

export function zoomOut(documentId: string): void {
  step(documentId, previousZoom)
}

export function zoomToFit(documentId: string): void {
  frame(documentId, (document, { host, inset }, integral) => fitTo(document, host, inset, integral))
}

/** One document pixel per screen pixel, centred — what ⌘1 means in every editor. */
export function zoomToActual(documentId: string): void {
  frame(documentId, (document, { host, inset }) => centerOn(document, host, 1, inset))
}

/** Both framings read the same two sizes; only the scale they settle on differs. */
function frame(
  documentId: string,
  place: (document: Size, panel: { host: Size; inset: number }, integral: boolean) => Viewport,
): void {
  const measured = panel(documentId)
  if (!measured) return

  const canvas = canvasOf(useCanvases.getState(), documentId)
  reframe(documentId, () =>
    place({ width: canvas.width, height: canvas.height }, measured, canvas.pixelCell !== null),
  )
}

export function toggleView(documentId: string, key: ViewToggle): void {
  useCanvasViews.getState().toggle(documentId, key)
}

/** Undoable like any other guide edit: dropping a whole set of them by accident is one ⌘Z away. */
export function clearGuides(documentId: string): void {
  useCanvases.getState().runCommand(documentId, clearGuidesCommand())
}
