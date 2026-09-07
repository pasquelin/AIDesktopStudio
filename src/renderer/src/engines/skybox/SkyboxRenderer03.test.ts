// @vitest-environment jsdom

import { Texture, WebGLRenderTarget } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { SphericalAngles } from '@shared/domain/angles'
import { createSkyboxContent, type SkyboxContent } from '@shared/domain/skybox'
import type * as AdjustModule from '../gpu/passes/adjust'
import type { AdjustPass } from '../gpu/passes/adjust'
import type { GpuPipeline } from '../gpu/gpuPipeline'
import type * as EnvironmentModule from '../viewport/environment'
import type * as TestObjectsModule from '../viewport/testObjects'
import type { TestObjects } from '../viewport/testObjects'
import { fakeEnvironment, fakeTextureSource } from '../viewport/viewport-fixtures'
import { ViewportEngine } from '../viewport/ViewportEngine'
import { SkyboxRenderer } from './SkyboxRenderer'

// The environment prefilters a mip chain and the pipeline draws into a target: both need the GL
// context jsdom has none of. `gestureFor` stays real — the wiring to it is what this proves.
const environment = fakeEnvironment()

const pipeline = {
  renderTo: vi.fn(),
  renderToScreen: vi.fn(),
  createTarget: vi.fn(() => new WebGLRenderTarget(4, 2)),
  dispose: vi.fn(),
} satisfies GpuPipeline

/**
 * The grading pass is what the whole engine exists to feed, so its inputs and its disposal are
 * watched. The real pass is kept underneath — it is a `ShaderMaterial`, which jsdom builds fine
 * — so the material handed to the pipeline stays the real one.
 */
let adjust: AdjustPass

/**
 * Kept real underneath — they are three meshes in a group, which jsdom builds fine — and held
 * onto so a test can read what the viewport would actually draw.
 */
let probes: TestObjects

vi.mock('../viewport/testObjects', async importOriginal => {
  const actual = await importOriginal<typeof TestObjectsModule>()
  return {
    ...actual,
    createTestObjects: (options: Parameters<typeof actual.createTestObjects>[0]) => {
      probes = actual.createTestObjects(options)
      // Watched rather than doubled: what the floor DOES with a map is `testObjects.test.ts`.
      vi.spyOn(probes, 'setGroundMap')
      return probes
    },
  }
})

vi.mock('../viewport/environment', async importOriginal => ({
  // Partial: the quiet this engine debounces on is the module's, and a total mock hides it.
  ...(await importOriginal<typeof EnvironmentModule>()),
  createEnvironment: () => environment,
}))
vi.mock('../gpu/gpuPipeline', () => ({ createGpuPipeline: () => pipeline }))
vi.mock('../gpu/passes/adjust', async importOriginal => {
  const actual = await importOriginal<typeof AdjustModule>()
  return {
    ...actual,
    createAdjustPass: () => {
      adjust = {
        ...actual.createAdjustPass(),
        setSource: vi.fn(),
        setAdjustments: vi.fn(),
        dispose: vi.fn(),
      }
      return adjust
    },
  }
})

const host = document.createElement('div')

/** Where a picture of the open project is read from — the floor's grid answers on another host. */
const ASSET_URL = 'ai-desktop-studio://asset/'

/** The floor's grid, shipped beside the app: no project takes part in answering for it. */
const GRID_URL = 'ai-desktop-studio://texture/GridLarge.png'

/** Azimuth `0` aims at `+Z`, which is where a ray through the centre of the frame goes. */
const SUN_AHEAD = 0
const SUN_BEHIND = Math.PI

const skyOf = (assetId: string): SkyboxContent => {
  const content = createSkyboxContent()
  content.source = { assetId }
  return content
}

const sunAt = (azimuth: number): SkyboxContent => {
  const content = createSkyboxContent()
  content.sun = { ...content.sun, elevation: 0, azimuth }
  return content
}

describe('the renderer of a skybox', () => {
  let onSunChange: Mock<(angles: SphericalAngles) => void>
  let source: ReturnType<typeof fakeTextureSource>
  let canvas: HTMLCanvasElement
  let camera: ViewportEngine['camera'] | null
  let disposeViewport: ReturnType<typeof vi.spyOn>
  let ndc: { x: number; y: number } | null
  let mountedRenderers: SkyboxRenderer[]

  beforeEach(() => {
    vi.clearAllMocks()
    // Fake from the start: the prefilter runs on a timer otherwise, and one left pending by a
    // test fires inside the next and refreshes an environment nobody asked.
    vi.useFakeTimers()
    onSunChange = vi.fn<(angles: SphericalAngles) => void>()
    mountedRenderers = []
    source = fakeTextureSource()
    canvas = document.createElement('canvas')
    camera = null
    ndc = { x: 0, y: 0 }

    vi.spyOn(ViewportEngine.prototype, 'mount').mockImplementation(() => {})
    disposeViewport = vi.spyOn(ViewportEngine.prototype, 'dispose')
    // `as`: neither the pipeline nor the environment is real here, and nothing else reads it.
    vi.spyOn(ViewportEngine.prototype, 'gl', 'get').mockReturnValue({} as never)
    vi.spyOn(ViewportEngine.prototype, 'canvas', 'get').mockReturnValue(canvas)
    vi.spyOn(ViewportEngine.prototype, 'pointerNdcOf').mockImplementation(function (
      this: ViewportEngine,
    ) {
      camera = this.camera
      // What a drawn frame would have done. Without it the camera's world matrix is still the
      // identity, every ray points down -Z whatever the camera was aimed at, and the gesture
      // the engine picks would be decided by an artefact of the test rather than by the sun.
      this.camera.updateMatrixWorld()
      return ndc
    })
  })

  afterEach(() => {
    // `mount` puts pointer listeners on `window` and only `dispose` takes them off. A renderer
    // left mounted keeps answering gestures in the tests that follow — which silently turned
    // four of the negative assertions below green for the wrong reason.
    for (const renderer of mountedRenderers) renderer.dispose()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  const mounted = (): SkyboxRenderer => {
    const renderer = new SkyboxRenderer({ onSunChange, loadTexture: source.load })
    renderer.mount(host)
    mountedRenderers.push(renderer)
    return renderer
  }

  const unmountable = (): SkyboxRenderer => {
    vi.spyOn(ViewportEngine.prototype, 'gl', 'get').mockReturnValue(null)
    return mounted()
  }

  /**
   * Waits for the PICTURE, not for the request: `apply` returns before the texture arrives, and a
   * test that only waits for the ask runs while the engine still holds nothing.
   */
  const applied = async (renderer: SkyboxRenderer, content: SkyboxContent): Promise<void> => {
    renderer.apply(content)
    // Draining the microtasks, not polling: `vi.waitFor` probes on a real interval and advances
    // the fake clock 50 ms per probe, which both costs wall time and eats into the quiet delay
    // the prefilter tests measure.
    await vi.advanceTimersByTimeAsync(0)
    expect(environment.setTexture).toHaveBeenLastCalledWith(expect.any(Texture))
  }

  const pointerAt = (type: string, x: number, y: number, button = 0): PointerEvent =>
    new PointerEvent(type, { clientX: x, clientY: y, button, bubbles: true })

  describe('dragging inside the picture', () => {
    const grabbingTheSun = (button = 0): SkyboxRenderer => {
      const renderer = mounted()
      renderer.apply(sunAt(SUN_AHEAD))
      canvas.dispatchEvent(pointerAt('pointerdown', 10, 10, button))
      return renderer
    }

    /**
     * The angles are the truth and the light follows them: a pointer raised above the horizon
     * has to report an elevation above it, whatever the light ended up at.
     */
    it('reports where the sun is dragged to, not where it was', () => {
      grabbingTheSun()

      ndc = { x: 0, y: 0.5 }
      window.dispatchEvent(pointerAt('pointermove', 20, 30))

      expect(onSunChange).toHaveBeenCalledTimes(1)
      expect(onSunChange.mock.calls[0]?.[0].elevation).toBeGreaterThan(0)
    })

    it('turns the head when the drag starts away from the sun', () => {
      const renderer = mounted()
      renderer.apply(sunAt(SUN_BEHIND))
      canvas.dispatchEvent(pointerAt('pointerdown', 10, 10))
      const before = camera?.quaternion.clone()

      window.dispatchEvent(pointerAt('pointermove', 40, 10))

      expect(onSunChange).not.toHaveBeenCalled()
      expect(camera?.quaternion.equals(before ?? camera.quaternion)).toBe(false)
    })

    // Dragging right turns the view left: the image follows the hand, as grabbing the world
    // implies. Inverted, the viewport fights every gesture.
    it('turns the view the way the hand went, and keeps going from where it left off', () => {
      const renderer = mounted()
      renderer.apply(sunAt(SUN_BEHIND))
      canvas.dispatchEvent(pointerAt('pointerdown', 10, 10))

      window.dispatchEvent(pointerAt('pointermove', 110, 10))
      const afterFirst = camera?.rotation.y ?? 0
      window.dispatchEvent(pointerAt('pointermove', 210, 10))

      expect(afterFirst).toBeLessThan(0)
      // Read from the last point, not from where the drag began: measured from the start, the
      // second half of a drag would replay the first and the view would move twice as fast.
      expect(camera?.rotation.y).toBeCloseTo(afterFirst * 2, 5)
    })

    it('raises the view when the hand goes down', () => {
      const renderer = mounted()
      renderer.apply(sunAt(SUN_BEHIND))
      canvas.dispatchEvent(pointerAt('pointerdown', 10, 10))

      window.dispatchEvent(pointerAt('pointermove', 10, 110))

      expect(camera?.rotation.x).toBeGreaterThan(0)
    })

    it('ignores a drag begun with another button', () => {
      grabbingTheSun(2)

      ndc = { x: 0, y: 0.5 }
      window.dispatchEvent(pointerAt('pointermove', 20, 30))

      expect(onSunChange).not.toHaveBeenCalled()
    })

    // A collapsed panel has no surface to hit: no gesture may begin on it, even if one could
    // continue by the time the pointer moves.
    it('ignores a drag begun on a canvas with no surface', () => {
      const renderer = mounted()
      renderer.apply(sunAt(SUN_AHEAD))
      ndc = null

      canvas.dispatchEvent(pointerAt('pointerdown', 10, 10))
      ndc = { x: 0, y: 0.5 }
      window.dispatchEvent(pointerAt('pointermove', 20, 30))

      expect(onSunChange).not.toHaveBeenCalled()
    })

    it('reports nothing while the pointer has no surface under it', () => {
      grabbingTheSun()

      ndc = null
      window.dispatchEvent(pointerAt('pointermove', 20, 30))

      expect(onSunChange).not.toHaveBeenCalled()
    })

    it('does nothing on a move with no drag under way', () => {
      mounted()

      window.dispatchEvent(pointerAt('pointermove', 20, 30))

      expect(onSunChange).not.toHaveBeenCalled()
    })

    it('lets the sun go when the pointer is released', () => {
      grabbingTheSun()

      window.dispatchEvent(pointerAt('pointerup', 10, 10))
      ndc = { x: 0, y: 0.5 }
      window.dispatchEvent(pointerAt('pointermove', 20, 30))

      expect(onSunChange).not.toHaveBeenCalled()
    })

    it('stops listening to the window once it is gone', () => {
      const renderer = grabbingTheSun()

      renderer.dispose()
      mountedRenderers.length = 0
      ndc = { x: 0, y: 0.5 }
      window.dispatchEvent(pointerAt('pointermove', 20, 30))

      expect(onSunChange).not.toHaveBeenCalled()
    })
  })

  describe('going away', () => {
    // The meshes themselves stay out — `testObjects.test.ts` covers what they wear and free.
    it('frees its sky, its grid, its environment, its quad and its viewport', async () => {
      const renderer = mounted()
      await applied(renderer, skyOf('sky-1'))

      renderer.dispose()

      expect(source.freedFor(`${ASSET_URL}sky-1`)).toHaveBeenCalled()
      expect(source.freedFor(GRID_URL)).toHaveBeenCalled()
      expect(environment.dispose).toHaveBeenCalled()
      expect(pipeline.dispose).toHaveBeenCalled()
      expect(disposeViewport).toHaveBeenCalled()
    })

    it('disposes cleanly when the mount never got a renderer', () => {
      const renderer = unmountable()

      expect(() => renderer.dispose()).not.toThrow()
      expect(pipeline.dispose).not.toHaveBeenCalled()
    })
  })
})

/**
 * The empty state is the one sentence telling anyone what to do in this space, and it is drawn
 * over the viewport. Seen on screen on 9 August: a `text-muted` over a lit ground and three
 * spheres does not read — and there is nothing to judge without a sky anyway.
 */
