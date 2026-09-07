import { useCallback } from 'react'
import type { Point } from '@/engines/core/geometry'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { useGenerationComments } from '@/stores/generationComments'
import { commentFor } from '@/features/image/generationComments'
import { newId } from '@/helpers/ids'

export function useCanvasGenerationComments(
  documentId: string,
): (at: Point, outline?: readonly Point[]) => void {
  const add = useGenerationComments(state => state.add)
  return useCallback(
    (at, outline) => {
      const layerId = canvasOf(useCanvases.getState(), documentId).activeLayerId
      add(documentId, {
        ...commentFor(newId(), at, layerId),
        ...(outline ? { outline } : {}),
      })
    },
    [documentId, add],
  )
}
