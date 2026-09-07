import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CANVAS } from '@/engines/canvas/canvasState'
import { installCanvas } from '@/stores/canvas-fixtures'
import { generationCommentsOf, useGenerationComments } from '@/stores/generationComments'
import { useCanvasGenerationComments } from './useCanvasGenerationComments'

beforeEach(() => {
  useGenerationComments.setState({ comments: {} })
})

describe('canvas generation comment scope', () => {
  it('captures the layer selected when the note is placed', () => {
    installCanvas('image-1')
    const { result } = renderHook(() => useCanvasGenerationComments('image-1'))

    act(() => result.current({ x: 10, y: 20 }))

    expect(generationCommentsOf(useGenerationComments.getState(), 'image-1')[0]?.layerId).toBe(
      DEFAULT_CANVAS.activeLayerId,
    )
  })

  it('makes the note global when no layer is selected', () => {
    installCanvas('image-1', { ...DEFAULT_CANVAS, activeLayerId: null })
    const { result } = renderHook(() => useCanvasGenerationComments('image-1'))

    act(() => result.current({ x: 10, y: 20 }))

    expect(
      generationCommentsOf(useGenerationComments.getState(), 'image-1')[0]?.layerId,
    ).toBeUndefined()
  })
})
