import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { CanvasEngine } from '@/engines/canvas/CanvasEngine'
import type { Point } from '@/engines/core/geometry'
import { registerFace } from '@/engines/canvas/canvasFonts'
import type { BrushSettings } from '@/engines/canvas/brush'
import { addLayer, cropToRect, resizeCaption } from '@/engines/canvas/commands'
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
    const created = new CanvasEngine({
      onPick: color => setBrush(current => ({ ...current, color })),
      onPixels: pixels.record,
      onPixelsDropped: pixels.drop,
      onViewport: viewport => views().setViewport(documentId, viewport),
      onSelection: selection => views().setSelection(documentId, selection),
      onSmartSelect: prompt => {
        void (async () => {
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
          created.setSelection({
            kind: 'raster',
            bounds: { x: 0, y: 0, width: result.width, height: result.height },
            width: result.width,
            height: result.height,
            alpha: result.alpha,
          })
          views().setSelection(documentId, {
            kind: 'raster',
            bounds: { x: 0, y: 0, width: result.width, height: result.height },
            width: result.width,
            height: result.height,
            alpha: result.alpha,
          })
        })()
      },
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
