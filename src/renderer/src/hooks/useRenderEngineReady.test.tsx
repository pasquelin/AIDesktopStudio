import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRenderEngineReady } from './useRenderEngineReady'

const gpuModule = vi.hoisted(() => ({
  loaded: null as object | null,
  settle: () => {},
}))

vi.mock('@/engines/render/gpuModule', () => ({
  loadedGpuModule: () => gpuModule.loaded,
  loadGpuModule: () =>
    new Promise(resolve => {
      gpuModule.settle = () => {
        gpuModule.loaded = {}
        resolve(gpuModule.loaded)
      }
    }),
}))

beforeEach(() => {
  gpuModule.loaded = null
  gpuModule.settle = () => {}
})

describe('whether a viewport may be built on an engine yet', () => {
  it('never holds the Compatible engine, which needs no bundle at all', () => {
    expect(renderHook(() => useRenderEngineReady('gl')).result.current).toBe(true)
  })

  /**
   * 🛑 The defect this exists for: a viewport mounted before the Advanced bundle landed was
   * handed the Compatible one and never asked again, so a document saved under Advanced drew
   * WebGL for the whole session that opened it.
   */
  it('holds the Advanced engine until its bundle has landed', async () => {
    const { result } = renderHook(() => useRenderEngineReady('gpu'))
    expect(result.current).toBe(false)

    gpuModule.settle()

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('holds nothing once the bundle is already in', () => {
    gpuModule.loaded = {}

    expect(renderHook(() => useRenderEngineReady('gpu')).result.current).toBe(true)
  })

  /**
   * A tab reads `gl` until its file lands. Latched from that phase, the answer would let the
   * Advanced engine mount on a bundle nobody had asked for.
   */
  it('holds again when a document turns out to ask for the Advanced engine', () => {
    const { result, rerender } = renderHook(({ engine }) => useRenderEngineReady(engine), {
      initialProps: { engine: 'gl' as const },
    })
    expect(result.current).toBe(true)

    rerender({ engine: 'gpu' as unknown as 'gl' })

    expect(result.current).toBe(false)
  })
})
