import type { CommandId } from '@shared/domain/command'
import { flipImage, rotateImage } from '@/engines/canvas/commands'
import type { CommandAnswer } from '@/services/commandBus'
import { runHistoryCommand } from '@/services/historyCommand'
import { canvasOf, canvasStore, useCanvases } from '@/stores/canvases'
import { useCanvasViews } from '@/stores/canvasViews'
import { clearGuides, toggleView, zoomIn, zoomOut, zoomToActual, zoomToFit } from '../../canvasView'
import { turnPort } from '../../turnPort'

const VIEW_COMMANDS: Partial<Record<CommandId, (documentId: string) => void>> = {
  'canvas.zoomIn': zoomIn,
  'canvas.zoomOut': zoomOut,
  'canvas.zoomFit': zoomToFit,
  'canvas.zoomActual': zoomToActual,
  'canvas.rulers': id => toggleView(id, 'rulers'),
  'canvas.guides': id => toggleView(id, 'guides'),
  'canvas.grid': id => toggleView(id, 'grid'),
  'canvas.snap': id => toggleView(id, 'snap'),
  'canvas.clearGuides': clearGuides,
}

/**
 * The commands of an image that read nothing but its stores, reached the same way from the tab
 * and from a headless run. What needs the engine on screen — a crop, a mask, a merge, an export,
 * the brush — stays with the tab, the only thing that has one.
 */
export function runCanvasCommand(documentId: string, command: CommandId): CommandAnswer {
  const viewCommand = VIEW_COMMANDS[command]
  if (viewCommand) {
    viewCommand(documentId)
    return true
  }
  switch (command) {
    case 'canvas.selectAll': {
      const stack = canvasOf(useCanvases.getState(), documentId)
      useCanvasViews.getState().setSelection(documentId, {
        kind: 'rect',
        rect: { x: 0, y: 0, width: stack.width, height: stack.height },
      })
      return true
    }
    case 'canvas.deselect':
      useCanvasViews.getState().setSelection(documentId, null)
      return true
    case 'canvas.flipHorizontal':
      useCanvases.getState().runCommand(documentId, flipImage('horizontal'))
      return true
    case 'canvas.flipVertical':
      useCanvases.getState().runCommand(documentId, flipImage('vertical'))
      return true
    case 'canvas.rotateCw':
    case 'canvas.rotateCcw':
      // The port turns the pixels, from inside the command — so an undo unturns them. Done
      // outside, ⌘Z gave back a portrait frame over landscape textures.
      useCanvases
        .getState()
        .runCommand(documentId, rotateImage(command === 'canvas.rotateCw', turnPort(documentId)))
      return true
    default:
      return runHistoryCommand(canvasStore, 'canvas', documentId, command) ?? false
  }
}
