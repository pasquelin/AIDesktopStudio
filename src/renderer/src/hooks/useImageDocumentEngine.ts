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
import { canvasHost, forgetCanvasApplied, holdCanvas } from '@/features/image/canvasHosts'
import { guidePort } from '@/features/image/guidePort'
import { layerPort } from '@/features/image/layerPort'
import { pixelPort } from '@/features/image/pixelPort'
import { newId } from '@/helpers/ids'
import { useLatest } from '@/hooks/useLatest'
import { canvasOf, canvasStore, useCanvases } from '@/stores/canvases'
import { useCanvasViews } from '@/stores/canvasViews'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { isAbortError } from '@shared/guards'
import type { SmartSelectionPrompt } from '@shared/domain/smartSelectionInference'
import type { SmartTool } from '@/engines/canvas/canvasTool'
import { GENERATION_COMMENT_OUTLINE_MAX } from '@shared/domain/generationComment'

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
    const smartSelect = async (prompt: SmartSelectionPrompt, tool: SmartTool): Promise<void> => {
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
      if (tool === 'smartComment') {
        const mark = markFor(boundedOutline(selectionOutline(raster)), prompt)
        onComment(mark.at, mark.outline)
        return
      }
      created.setSelection(raster)
      views().setSelection(documentId, raster)
    }
    // One run for both tools, told apart by what it does with the mask and by the channel a
    // failure is said on. The cancel of the run before it is not a failure.
    const reportedSmart = async (tool: SmartTool, prompt: SmartSelectionPrompt): Promise<void> => {
      try {
        await smartSelect(prompt, tool)
      } catch (error) {
        if (!isAbortError(error)) reportFailure(`canvas.${tool}`, documentId, error)
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
      // and nothing explained why.
      onSmartSelect: prompt => void reportedSmart('smartSelect', prompt),
      onSmartComment: prompt => void reportedSmart('smartComment', prompt),
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
      // Only when nothing took its place, for the reason `release` itself checks: a remount
      // registers the new engine before this cleanup runs, and forgetting then would strand it.
      if (!canvasHost(documentId)) forgetCanvasApplied(documentId)
      created.dispose()
      engineRef.current = null
    }
  }, [documentId, caption, shapeName, setBrush, onComment])

  return { hostRef, engineRef, editing, setEditing }
}

/**
 * The note a traced object gets: anchored on the shape itself rather than on the box drawn to hint
 * at it, and — when nothing was outlined — still a note, as a freeform comment under three points.
 */
function markFor(
  outline: readonly Point[],
  prompt: SmartSelectionPrompt,
): { at: Point; outline?: readonly Point[] } {
  const start = outline.length > 2 ? outline[0] : undefined
  if (start === undefined) {
    return { at: 'point' in prompt ? prompt.point : { x: prompt.box.x, y: prompt.box.y } }
  }

  return { at: start, outline }
}

/** A traced outline thinned to what a comment may carry — `canvasHandlers` refuses a longer one. */
function boundedOutline(outline: readonly Point[]): readonly Point[] {
  if (outline.length <= GENERATION_COMMENT_OUTLINE_MAX) return outline
  const step = (outline.length - 1) / (GENERATION_COMMENT_OUTLINE_MAX - 1)
  // The filter drops nothing — the last index lands on `length - 1` exactly — it is how the
  // indexing is typed rather than a case that happens.
  return Array.from(
    { length: GENERATION_COMMENT_OUTLINE_MAX },
    (_, index) => outline[Math.round(index * step)],
  ).filter(point => point !== undefined)
}
