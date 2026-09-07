import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CANVAS } from '@/engines/canvas/canvasState'
import { DEFAULT_VIEW } from '@/engines/canvas/viewport'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { useCanvasViews, canvasViewOf } from '@/stores/canvasViews'
import { useDocuments } from '@/stores/documents'
import { clearGuides, toggleView, zoomIn, zoomOut, zoomToActual, zoomToFit } from './canvasView'

const DOCUMENT = 'doc-1'
const HOST = { width: 800, height: 600 }

const viewport = () => canvasViewOf(useCanvasViews.getState(), DOCUMENT).viewport

function openImage(): void {
  useDocuments.setState({
    activeId: DOCUMENT,
    documents: {
      [DOCUMENT]: {
        id: DOCUMENT,
        kind: 'image',
        workspace: 'image',
        title: 'Sans titre',
        path: 'documents/Sans titre.ora',
      },
    },
  })
  useCanvases.setState({
    states: { [DOCUMENT]: { ...DEFAULT_CANVAS, width: 400, height: 200 } },
    histories: {},
  })
  useCanvasViews.setState({ views: {}, hosts: { [DOCUMENT]: HOST } })
}

describe('zooming', () => {
  beforeEach(openImage)

  it('walks up the stops without moving the middle of the panel', () => {
    zoomToActual(DOCUMENT)
    zoomIn(DOCUMENT)

    expect(viewport().scale).toBe(1.5)
    // The middle of what is visible stays put: at 1:1 the document sits at 210, so the point
    // under the anchor (410) is at 200 and has to land there again at 1.5.
    expect(viewport().x).toBe(110)
  })

  it('walks back down the same ladder', () => {
    zoomToActual(DOCUMENT)
    zoomIn(DOCUMENT)
    zoomOut(DOCUMENT)

    expect(viewport().scale).toBe(1)
  })

  // On a grid, ⌘+ walks whole stops: 1.5 would put one document pixel on a pixel and a half.
  it('walks whole stops once the document is on a pixel grid', () => {
    useCanvases.setState({
      states: { [DOCUMENT]: { ...DEFAULT_CANVAS, width: 400, height: 200, pixelCell: 1 } },
      histories: {},
    })
    zoomToActual(DOCUMENT)
    zoomIn(DOCUMENT)

    expect(viewport().scale).toBe(2)
  })

  it('fits the document with room to breathe, beside the rulers', () => {
    zoomToFit(DOCUMENT)

    // The bands cover the top and left 20 px: framing across the whole host would centre the
    // document with its first rows under opaque chrome, where they cannot even be painted.
    expect(viewport()).toEqual({ scale: 1, x: 210, y: 210 })
  })

  it('frames across the whole panel once the rulers are off', () => {
    toggleView(DOCUMENT, 'rulers')
    zoomToFit(DOCUMENT)

    expect(viewport()).toEqual({ scale: 1, x: 200, y: 200 })
  })

  // The engine measures the panel one frame after the document opens, and ⌘0 is reachable
  // before that. Computed against a zero-sized host it lands at 2% in a corner.
  it('does nothing at all while the panel has not been measured', () => {
    useCanvasViews.setState({ views: {}, hosts: {} })

    zoomToFit(DOCUMENT)
    zoomToActual(DOCUMENT)
    zoomIn(DOCUMENT)

    expect(viewport()).toEqual(DEFAULT_VIEW.viewport)
  })

  it('goes back to one screen pixel per document pixel', () => {
    zoomIn(DOCUMENT)
    zoomToActual(DOCUMENT)

    expect(viewport().scale).toBe(1)
  })
})

describe('toggleView', () => {
  beforeEach(openImage)

  it('flips one toggle without touching the others', () => {
    toggleView(DOCUMENT, 'rulers')

    const view = canvasViewOf(useCanvasViews.getState(), DOCUMENT)
    expect(view.rulers).toBe(false)
    expect(view.guides).toBe(true)
    expect(view.snap).toBe(true)
  })
})

describe('clearGuides', () => {
  beforeEach(openImage)

  it('drops every guide, and ⌘Z gives them all back', () => {
    useCanvases.setState({
      states: {
        [DOCUMENT]: {
          ...DEFAULT_CANVAS,
          guides: [
            { id: 'g1', axis: 'x', position: 10 },
            { id: 'g2', axis: 'y', position: 20 },
          ],
        },
      },
      histories: {},
    })

    clearGuides(DOCUMENT)
    expect(canvasOf(useCanvases.getState(), DOCUMENT).guides).toEqual([])

    useCanvases.getState().undo(DOCUMENT)
    expect(canvasOf(useCanvases.getState(), DOCUMENT).guides).toHaveLength(2)
  })
})
