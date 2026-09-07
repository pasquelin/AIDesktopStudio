import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CANVAS } from '@/engines/canvas/canvasState'
import { installCanvas } from '@/stores/canvas-fixtures'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { canvasViewOf, selectionOf, useCanvasViews } from '@/stores/canvasViews'
import { runCanvasCommand } from './canvasCommands'

const DOCUMENT = 'doc-1'

beforeEach(() => {
  installCanvas(DOCUMENT, { ...DEFAULT_CANVAS, width: 64, height: 32 })
  useCanvasViews.setState({ views: {} })
})

describe('the commands of an image that read nothing but its stores', () => {
  it('selects the whole frame, and lets go of it', () => {
    expect(runCanvasCommand(DOCUMENT, 'canvas.selectAll')).toBe(true)
    expect(selectionOf(useCanvasViews.getState(), DOCUMENT)).toEqual({
      kind: 'rect',
      rect: { x: 0, y: 0, width: 64, height: 32 },
    })

    expect(runCanvasCommand(DOCUMENT, 'canvas.deselect')).toBe(true)
    expect(selectionOf(useCanvasViews.getState(), DOCUMENT)).toBeNull()
  })

  it('turns a view setting', () => {
    const before = canvasViewOf(useCanvasViews.getState(), DOCUMENT).rulers

    expect(runCanvasCommand(DOCUMENT, 'canvas.rulers')).toBe(true)

    expect(canvasViewOf(useCanvasViews.getState(), DOCUMENT).rulers).toBe(!before)
  })

  /** The one entry a flip puts on the stack is what makes the undo below answer true. */
  it('flips the picture as one history entry, and says an empty stack has nothing to undo', () => {
    expect(runCanvasCommand(DOCUMENT, 'canvas.undo')).toBe(false)

    expect(runCanvasCommand(DOCUMENT, 'canvas.flipHorizontal')).toBe(true)
    expect(useCanvases.getState().histories[DOCUMENT]?.past).toHaveLength(1)
    expect(runCanvasCommand(DOCUMENT, 'canvas.undo')).toBe(true)
    expect(canvasOf(useCanvases.getState(), DOCUMENT).width).toBe(64)
  })

  it('leaves what needs the engine on screen to the tab', () => {
    expect(runCanvasCommand(DOCUMENT, 'canvas.flatten')).toBe(false)
  })
})
