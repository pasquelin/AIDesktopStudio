import { describe, expect, it, vi } from 'vitest'
import type { WebGLRenderer } from 'three'
import { mountRenderer, type RenderDrivers } from './mountRenderer'
import type { RenderDriver, RendererRequest } from './renderDriver'

/**
 * The two casts of this file, and their one reason: which driver answered is settled by
 * IDENTITY, so nothing here reads a canvas or a renderer — and a graphics context is exactly
 * what a test may not need, this suite running under node.
 */
const NOTHING = {}

const request: RendererRequest = { canvas: canvasStub(), alpha: false }

function canvasStub(): HTMLCanvasElement {
  return NOTHING as HTMLCanvasElement
}

function drivers(gpu: Partial<RenderDriver> = {}): RenderDrivers {
  const stub = (engine: 'gl' | 'gpu'): RenderDriver => ({
    engine,
    createRenderer: () => rendererStub(engine),
    ready: () => null,
    readPixels: () => Promise.resolve(new Uint8Array()),
    createComposer: () => {
      throw new Error('not asked for')
    },
    createEnvironment: () => {
      throw new Error('not asked for')
    },
    patchMaterial: () => {},
    maxSamples: () => 0,
    maxAnisotropy: () => 1,
    frameTimer: () => null,
    releaseContext: () => {},
  })
  return { gl: stub('gl'), gpu: { ...stub('gpu'), ...gpu } }
}

function rendererStub(engine: 'gl' | 'gpu'): WebGLRenderer {
  return { engine } as unknown as WebGLRenderer
}

describe('mounting a renderer', () => {
  it('draws with the Advanced engine once an adapter has answered', () => {
    const two = drivers()

    expect(mountRenderer(request, 'gpu', true, vi.fn(), two).driver).toBe(two.gpu)
  })

  it('keeps the Compatible engine while nobody has asked the adapter yet', () => {
    // A mount cannot wait on `requestAdapter`, and a viewport that waited would show nothing.
    const two = drivers()

    expect(mountRenderer(request, 'gpu', null, vi.fn(), two).driver).toBe(two.gl)
  })

  it('falls back to the Compatible engine when the Advanced one throws', () => {
    const two = drivers({
      createRenderer: () => {
        throw new Error('no device')
      },
    })
    const said = vi.fn()

    const mounted = mountRenderer(request, 'gpu', true, said, two)

    expect(mounted.driver).toBe(two.gl)
    expect(said).toHaveBeenCalledOnce()
  })

  it('says why when a machine with no adapter was asked for the Advanced engine', () => {
    const said = vi.fn()

    mountRenderer(request, 'gpu', false, said, drivers())

    expect(said).toHaveBeenCalledOnce()
  })

  it('says nothing at all for a project that asked for the Compatible engine', () => {
    const said = vi.fn()

    const mounted = mountRenderer(request, 'gl', false, said, drivers())

    expect(mounted.driver.engine).toBe('gl')
    expect(said).not.toHaveBeenCalled()
  })
})
