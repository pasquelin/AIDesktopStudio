import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CANVAS } from '@/engines/canvas/canvasState'
import { paintPixels } from '@/engines/canvas/commands'
import { holdCanvas } from '@/features/image/canvasHosts'
import { canvasHostStub, installCanvas } from '@/stores/canvas-fixtures'
import { useCanvases } from '@/stores/canvases'
import { usePixelPreview } from './usePixelPreview'

const DOCUMENT = 'doc-1'

/** Only `close` and the draw are exercised, so a whole `ImageBitmap` would be furniture. */
const bitmap = (): ImageBitmap => ({ close: () => {} }) as unknown as ImageBitmap

type Draw = { source: number[]; smoothing: boolean }

/** The canvas the hook draws into, and what it asked the context for. */
function surfaceOf(draws: Draw[]): { current: HTMLCanvasElement } {
  let smoothing = true
  const context = {
    clearRect: () => {},
    drawImage: (_picture: ImageBitmap, ...box: number[]) => draws.push({ source: box, smoothing }),
    set imageSmoothingEnabled(value: boolean) {
      smoothing = value
    },
  }
  return { current: { getContext: () => context } as unknown as HTMLCanvasElement }
}

describe('usePixelPreview', () => {
  let drop = (): void => {}

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    installCanvas(DOCUMENT, { ...DEFAULT_CANVAS, pixelCell: 16 })
  })

  afterEach(() => {
    drop()
    vi.useRealTimers()
  })

  /**
   * The source rectangle is a whole number of CELLS, not the document's own size: scaling 100 px
   * into 7 columns samples a fraction of a cell off, and the last cell is never drawn at all.
   */
  it('draws whole cells, unsmoothed, however the document divides', async () => {
    drop = holdCanvas(DOCUMENT, () => canvasHostStub({ flattenBitmap: async () => bitmap() }))
    const draws: Draw[] = []
    renderHook(() => usePixelPreview(DOCUMENT, surfaceOf(draws), 7, 7, 16))

    await waitFor(() => expect(draws).toHaveLength(1))
    expect(draws[0]).toEqual({ source: [0, 0, 112, 112, 0, 0, 7, 7], smoothing: false })
  })

  /**
   * 🛑 A stroke hands the state straight back — `paintPixels` returns the very object it was
   * given, the pixels living in a texture. Watching the state alone, the preview never redrew
   * after a stroke, which is the only thing it is there to show. Measured in the running studio.
   */
  it('draws again when a stroke lands, which leaves the state untouched', async () => {
    drop = holdCanvas(DOCUMENT, () => canvasHostStub({ flattenBitmap: async () => bitmap() }))
    const draws: Draw[] = []
    renderHook(() => usePixelPreview(DOCUMENT, surfaceOf(draws), 4, 4, 8))
    await waitFor(() => expect(draws).toHaveLength(1))

    act(() =>
      useCanvases
        .getState()
        .runCommand(DOCUMENT, paintPixels('patch-1', { restore: () => true, lost: () => {} })),
    )

    await waitFor(() => expect(draws).toHaveLength(2), { timeout: 2000 })
  })

  /**
   * 🛑 Past `PREVIEW_MAX_CELLS` the frame draws an `EmptyState` and no canvas at all, so the retry
   * above could never be satisfied — a whole-document extraction every 120 ms, panel open, for
   * ever. Measured on the grid Alban was looking at: 2048 cells a side.
   */
  it('asks for nothing at all when there is no canvas to draw into', async () => {
    let asked = 0
    drop = holdCanvas(DOCUMENT, () =>
      canvasHostStub({
        flattenBitmap: async () => {
          asked += 1
          return bitmap()
        },
      }),
    )
    renderHook(() => usePixelPreview(DOCUMENT, surfaceOf([]), 0, 0, 16))

    await new Promise(resolve => setTimeout(resolve, 500))
    expect(asked).toBe(0)
  })

  /**
   * A document opens before its engine mounts and before its layers are read back, and neither
   * writes the store — without a retry the preview stays blank until an unrelated edit lands.
   */
  it('asks again while nothing has been drawn yet', async () => {
    let asked = 0
    drop = holdCanvas(DOCUMENT, () =>
      canvasHostStub({
        flattenBitmap: async () => ((asked += 1) > 2 ? bitmap() : null),
      }),
    )
    const draws: Draw[] = []
    renderHook(() => usePixelPreview(DOCUMENT, surfaceOf(draws), 4, 4, 8))

    await waitFor(() => expect(draws).toHaveLength(1), { timeout: 2000 })
    expect(asked).toBe(3)
  })
})
