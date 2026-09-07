import { useShallow } from 'zustand/react/shallow'
import { gridOf } from '@/engines/canvas/pixelGrid'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { activeImageId, useDocuments } from '@/stores/documents'

/**
 * The image in front, in cells — `null` off a grid. 🛑 `useShallow` because `gridOf` composes a
 * fresh object: measured at 54 renders before React gave up. The trap `useGenerationContext` names.
 */
export function usePixelArtGrid(): { cell: number; columns: number; rows: number } | null {
  const documentId = useDocuments(activeImageId)
  return useCanvases(
    useShallow(state => (documentId === null ? null : gridOf(canvasOf(state, documentId)))),
  )
}
