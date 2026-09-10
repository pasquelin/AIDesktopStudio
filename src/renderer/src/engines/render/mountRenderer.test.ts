import { describe, expect, it, vi } from 'vitest'
import type { WebGLRenderer } from 'three'
import { driverFor, mountRenderer, type RenderDrivers } from './mountRenderer'
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
    readPixels: () => Promise.resolve(new Uint8Array()),
    createEnvironment: () => {
      throw new Error('not asked for')
    },
    patchMaterial: () => {},
  })
  return { gl: stub('gl'), gpu: { ...stub('gpu'), ...gpu } }
}

function rendererStub(engine: 'gl' | 'gpu'): WebGLRenderer {
  return { engine } as unknown as WebGLRenderer
}

describe('which driver a policy gets', () => {
  it('draws with the Compatible engine unless the Advanced one is asked for', () => {
    const two = drivers()
    expect(driverFor('gl', true, two)).toBe(two.gl)
  })

  it('draws with the Advanced engine when an adapter answered', () => {
    const two = drivers()
    expect(driverFor('gpu', true, two)).toBe(two.gpu)
  })

  it('keeps the Compatible engine while nobody has asked the adapter yet', () => {
    // A mount cannot wait on `requestAdapter`, and a viewport that waited would show nothing.
    const two = drivers()
    expect(driverFor('gpu', null, two)).toBe(two.gl)
  })

  it('keeps the Compatible engine when the adapter refused', () => {
    const two = drivers()
    expect(driverFor('gpu', false, two)).toBe(two.gl)
  })
})

describe('mounting a renderer', () => {
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
