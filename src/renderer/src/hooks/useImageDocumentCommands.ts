import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import type { CommandId } from '@shared/domain/command'
import type { BrushSettings } from '@/engines/canvas/brush'
import { canMergeDown, layerBelow } from '@/engines/canvas/canvasState'
import { flatten, mergeDown } from '@/engines/canvas/commands'
import type { CanvasEngine } from '@/engines/canvas/CanvasEngine'
import type { CanvasTool } from '@/engines/canvas/canvasTool'
import { readsBrushSetting, resizedBrush } from '@/engines/canvas/brush'
import { aiEditOf, armedBy } from '@/features/image/imageTools'
import { exportLayeredPicture, exportPicture } from '@/features/image/exportPicture'
import { maskFromSelection } from '@/features/image/maskActions'
import { prepareEdit } from '@/features/image/aiActions'
import { runCanvasCommand } from '@/features/image/components/ImageDocument/canvasCommands'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { newId } from '@/helpers/ids'
import type { CommandAnswer } from '@/services/commandBus'

type PickTool = (toolId: string, modeId?: string) => void
type RunAnswer = CommandAnswer | void

async function runExport(
  documentId: string,
  command: CommandId,
  host: CanvasEngine,
): Promise<void> {
  try {
    if (command === 'canvas.export') await exportPicture(documentId, host)
    else await exportLayeredPicture(documentId, host)
  } catch (error) {
    reportFailure('image.export', documentId, error)
  }
}

async function runEdit(
  documentId: string,
  command: CommandId,
  host: CanvasEngine,
  setPreparing: Dispatch<SetStateAction<boolean>>,
): Promise<void> {
  const bridge = getBridge()
  const edit = aiEditOf(command)
  if (!bridge || !edit) return
  setPreparing(true)
  try {
    await prepareEdit(documentId, edit, host, bridge.provider)
  } catch (error) {
    reportFailure('canvas.edit', documentId, error)
  } finally {
    setPreparing(false)
  }
}

function runMerge(documentId: string, host: CanvasEngine): void {
  const stack = canvasOf(useCanvases.getState(), documentId)
  const active = stack.activeLayerId
  if (!active || !canMergeDown(stack)) return
  const below = layerBelow(stack.layers, active)
  if (!below) return
  host.mergeInto(below.id, active)
  useCanvases.getState().runCommand(documentId, mergeDown(active))
}

function runFlatten(documentId: string, host: CanvasEngine, name: string): void {
  const id = newId()
  host.flattenInto(id)
  useCanvases.getState().runCommand(documentId, flatten(id, name))
}

type Options = {
  documentId: string
  engineRef: RefObject<CanvasEngine | null>
  armed: RefObject<CanvasTool>
  pick: PickTool
  setBrush: Dispatch<SetStateAction<BrushSettings>>
  setPreparing: Dispatch<SetStateAction<boolean>>
}

export function useImageDocumentCommands(options: Options): (command: CommandId) => RunAnswer {
  const { documentId, engineRef, armed, pick, setBrush, setPreparing } = options
  const { t } = useTranslation()
  return useCallback(
    (command: CommandId): RunAnswer => {
      const arming = armedBy(command)
      if (arming) return pick(arming.tool, arming.mode)
      const shared = runCanvasCommand(documentId, command)
      if (shared !== false) return shared
      const host = engineRef.current
      if (command === 'canvas.export' || command === 'canvas.exportLayered') {
        if (host) void runExport(documentId, command, host)
      } else if (command === 'canvas.brushLarger' || command === 'canvas.brushSmaller') {
        if (!readsBrushSetting(armed.current, 'size')) return
        const way = command === 'canvas.brushLarger' ? 'larger' : 'smaller'
        setBrush(current => resizedBrush(current, way))
      } else if (command === 'canvas.cropApply') host?.applyCrop()
      else if (command === 'canvas.cropCancel') host?.dropCrop()
      else if (command === 'canvas.maskFromSelection' && host) maskFromSelection(documentId, host)
      else if (aiEditOf(command) && host) {
        void runEdit(documentId, command, host, setPreparing)
      } else if (command === 'canvas.mergeDown' && host) runMerge(documentId, host)
      else if (command === 'canvas.flatten' && host)
        runFlatten(documentId, host, t('commands.canvasFlatten.layerName'))
    },
    [armed, documentId, engineRef, pick, setBrush, setPreparing, t],
  )
}
