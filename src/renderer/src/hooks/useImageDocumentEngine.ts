import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { CanvasEngine } from '@/engines/canvas/CanvasEngine'
import type { Point } from '@/engines/core/geometry'
import { registerFace } from '@/engines/canvas/canvasFonts'
import type { BrushSettings } from '@/engines/canvas/brush'
import { addLayer, cropToRect, resizeCaption } from '@/engines/canvas/commands'
import type { CanvasSelection } from '@/engines/canvas/canvasSelection'
import { selectionOutline } from '@/engines/canvas/canvasSelection'
import { shapeLayer, textLayer, type ShapeKind } from '@/engines/canvas/canvasState'
import { holdCanvas } from '@/features/image/canvasHosts'
import { guidePort } from '@/features/image/guidePort'
import { layerPort } from '@/features/image/layerPort'
import { pixelPort } from '@/features/image/pixelPort'
import { newId } from '@/helpers/ids'
import { useLatest } from '@/hooks/useLatest'
import { canvasOf, canvasStore, useCanvases } from '@/stores/canvases'
import { useCanvasViews } from '@/stores/canvasViews'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import type { SmartSelectionPrompt } from '@shared/domain/smartSelectionInference'
import { GENERATION_COMMENT_OUTLINE_MAX } from '@shared/domain/generationComment'

/** A run the click after it cancelled: not a failure, and nothing for a reader to act on. */
const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError'

type EngineHandle = {
  hostRef: React.RefObject<HTMLDivElement | null>
  engineRef: React.RefObject<CanvasEngine | null>
  editing: string | null
  setEditing: Dispatch<SetStateAction<string | null>>
}

export function useImageDocumentEngine(
  documentId: string,
  setBrush: Dispatch<SetStateAction<BrushSettings>>,
  onComment: (at: Point, outline?: readonly Point[]) => void,
): EngineHandle {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<CanvasEngine | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const smartSelectionTask = useRef<string | null>(null)
  const caption = useLatest(t('imageTools.textName'))
  const shapeName = useLatest((kind: ShapeKind) => t(`layers.shapeName_${kind}`))

  useEffect(() => {
    const element = hostRef.current
    if (!element) return
    const views = () => useCanvasViews.getState()
    const pixels = pixelPort(documentId, () => engineRef.current)
    const smartSelect = async (prompt: SmartSelectionPrompt, comment: boolean): Promise<void> => {
      const previous = smartSelectionTask.current
      const id = newId()
      smartSelectionTask.current = id
      const bridge = getBridge()
      if (previous) await bridge?.tasks.cancel(previous)
      const png = await created.flatten()
      const state = canvasOf(useCanvases.getState(), documentId)
      if (!png || !bridge?.smartSelection || !state) return
      const store = useCanvases.getState()
      const revision = `${canvasStore.incarnationOf(store, documentId) ?? documentId}:${canvasStore.revisionOf(store, documentId)}`
      const result = await bridge.smartSelection.run({
        id,
        revision,
        png,
        width: state.width,
        height: state.height,
        prompt,
      })
      if (smartSelectionTask.current !== id) return
      const raster: CanvasSelection = {
        kind: 'raster',
        bounds: { x: 0, y: 0, width: result.width, height: result.height },
        width: result.width,
        height: result.height,
        alpha: result.alpha,
      }
      if (comment) {
        const outline = boundedOutline(selectionOutline(raster))
        if (outline.length > 2) onComment(anchorOf(prompt), outline)
        return
      }
      created.setSelection(raster)
      views().setSelection(documentId, raster)
    }
    const reportedSmartSelect = async (prompt: SmartSelectionPrompt): Promise<void> => {
      try {
        await smartSelect(prompt, false)
      } catch (error) {
        if (!isAbortError(error)) reportFailure('canvas.smartSelect', documentId, error)
      }
    }
    const reportedSmartComment = async (prompt: SmartSelectionPrompt): Promise<void> => {
      try {
        await smartSelect(prompt, true)
      } catch (error) {
        if (!isAbortError(error)) reportFailure('canvas.smartComment', documentId, error)
      }
    }
    const created = new CanvasEngine({
      onPick: color => setBrush(current => ({ ...current, color })),
      onPixels: pixels.record,
      onPixelsDropped: pixels.drop,
      onViewport: viewport => views().setViewport(documentId, viewport),
      onSelection: selection => views().setSelection(documentId, selection),
      // 🛑 Said and not dropped: a model that is not installed, an engine that does not answer
      // and a box too thin all rejected into `traceDroppedRejections`, so the click did nothing
      // and nothing explained why. The cancel of the run before it is not a failure.
      onSmartSelect: prompt => void reportedSmartSelect(prompt),
      onSmartComment: prompt => void reportedSmartComment(prompt),
      onComment,
      onHost: size => views().setHost(documentId, size),
      onText: asked => {
        if ('layerId' in asked) return setEditing(asked.layerId)
        const id = newId()
        const born = { ...textLayer(id, '', asked.at, asked.box), name: caption.current }
        useCanvases.getState().runCommand(documentId, addLayer(born))
        setEditing(id)
      },
      onTextBox: (layerId, box, at) =>
        useCanvases.getState().runCommand(documentId, resizeCaption(layerId, box, at)),
      onShape: (at, drawn) =>
        useCanvases
          .getState()
          .runCommand(
            documentId,
            addLayer(shapeLayer(newId(), shapeName.current(drawn.shape), at, drawn)),
          ),
      onCrop: rect => useCanvases.getState().runCommand(documentId, cropToRect(rect)),
      onCropFrame: framed => views().setCropFrame(documentId, framed),
      guides: guidePort(documentId),
      layers: layerPort(documentId),
      addFace: registerFace,
    })
    engineRef.current = created
    const release = holdCanvas(documentId, () => engineRef.current)
    void created.mount(element)
    return () => {
      release()
      created.dispose()
      engineRef.current = null
    }
  }, [documentId, caption, shapeName, setBrush, onComment])

  return { hostRef, engineRef, editing, setEditing }
}

function anchorOf(prompt: SmartSelectionPrompt): Point {
  return 'point' in prompt ? prompt.point : { x: prompt.box.x, y: prompt.box.y }
}

function boundedOutline(outline: readonly Point[]): readonly Point[] {
  if (outline.length <= GENERATION_COMMENT_OUTLINE_MAX) return outline
  const step = (outline.length - 1) / (GENERATION_COMMENT_OUTLINE_MAX - 1)
  return Array.from(
    { length: GENERATION_COMMENT_OUTLINE_MAX },
    (_, index) => outline[Math.round(index * step)] ?? outline[outline.length - 1]!,
  )
}
