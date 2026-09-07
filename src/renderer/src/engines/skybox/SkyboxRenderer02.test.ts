// @vitest-environment jsdom

import { DirectionalLight, Texture, WebGLRenderTarget } from 'three'
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

/** The floor's grid, shipped beside the app: no project takes part in answering for it. */
const GRID_URL = 'ai-desktop-studio://texture/GridLarge.png'

const skyOf = (assetId: string): SkyboxContent => {
  const content = createSkyboxContent()
  content.source = { assetId }
  return content
}

/**
 * One edit, shaped as `skybox/commands.ts:31` makes it: the section it touches is replaced and
 * the other three come back as the same objects. Building a whole content instead would hand the
 * engine four new sections and prove nothing about what a real drag costs.
 */
const edited = <K extends keyof SkyboxContent>(
  content: SkyboxContent,
  key: K,
  section: SkyboxContent[K],
): SkyboxContent => ({ ...content, [key]: section })

/** A gesture on the sun's colour, one frame per emitted value, as the slider sends them. */
const draggedSun = (sky: SkyboxContent, frames: number): SkyboxContent[] =>
  Array.from({ length: frames }, (_unused, frame) =>
    edited(sky, 'sun', { ...sky.sun, color: `#ff00${frame.toString(16).padStart(2, '0')}` }),
  )

describe('the renderer of a skybox', () => {
  let onSunChange: Mock<(angles: SphericalAngles) => void>
  let source: ReturnType<typeof fakeTextureSource>
  let canvas: HTMLCanvasElement
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
    ndc = { x: 0, y: 0 }

    vi.spyOn(ViewportEngine.prototype, 'mount').mockImplementation(() => {})
    // `as`: neither the pipeline nor the environment is real here, and nothing else reads it.
    vi.spyOn(ViewportEngine.prototype, 'gl', 'get').mockReturnValue({} as never)
    vi.spyOn(ViewportEngine.prototype, 'canvas', 'get').mockReturnValue(canvas)
    vi.spyOn(ViewportEngine.prototype, 'pointerNdcOf').mockImplementation(function (
      this: ViewportEngine,
    ) {
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

  describe("the probes' floor", () => {
    // NO PRIMITIVE IS BORN BARE — a white plane says nothing about the scale of what lights it.
    it('dresses the floor with the shipped grid, read from beside the app', async () => {
      mounted()
      await vi.advanceTimersByTimeAsync(0)

      expect(source.load).toHaveBeenCalledWith(GRID_URL)
      expect(probes.setGroundMap).toHaveBeenCalledWith(expect.any(Texture))
    })

    it('frees a grid that arrives after the engine went away', async () => {
      let arrive: (texture: Texture) => void = () => {}
      source.load.mockImplementationOnce(() => new Promise(resolve => (arrive = resolve)))
      const renderer = mounted()

      renderer.dispose()
      mountedRenderers.length = 0
      const grid = new Texture()
      const freed = vi.spyOn(grid, 'dispose')
      arrive(grid)
      await vi.advanceTimersByTimeAsync(0)

      expect(freed).toHaveBeenCalled()
      expect(probes.setGroundMap).not.toHaveBeenCalled()
    })
  })

  describe('the prefiltered map', () => {
    /**
     * The QUIET is `ViewportEnvironment`'s, and `environment.test.ts` holds it — a scene grading
     * the same sky must not pay it twice. What this engine owes is one push per value, so the
     * one debounce downstream sees the drag it is there to absorb.
     */
    it('pushes one grading per value of a drag, and the quiet is downstream', async () => {
      const renderer = mounted()
      const sky = skyOf('sky-1')
      await applied(renderer, sky)
      vi.mocked(environment.setAdjustments).mockClear()

      for (const exposure of [1.1, 1.2, 1.3])
        renderer.apply(edited(sky, 'adjustments', { ...sky.adjustments, exposure }))

      expect(environment.setAdjustments).toHaveBeenCalledTimes(3)
    })

    /**
     * The sun is a LIGHT, not part of the graded picture. Before the guard, every frame of a sun
     * drag re-graded the picture into the float target — two hundred passes for a hand moving.
     */
    it('grades nothing at all for a drag that only moves the sun', async () => {
      const renderer = mounted()
      const sky = skyOf('sky-1')
      await applied(renderer, sky)
      vi.mocked(environment.setAdjustments).mockClear()

      for (const frame of draggedSun(sky, 50)) renderer.apply(frame)

      expect(environment.setAdjustments).not.toHaveBeenCalled()
    })

    /** The quiet it armed is the environment's, and disposing that is what cancels it. */
    it('hands the environment back, so no prefilter outlives the engine', async () => {
      const renderer = mounted()
      await applied(renderer, skyOf('sky-1'))
      vi.mocked(environment.refresh).mockClear()

      renderer.dispose()
      await vi.advanceTimersByTimeAsync(500)

      expect(environment.dispose).toHaveBeenCalled()
      expect(environment.refresh).not.toHaveBeenCalled()
    })
  })

  describe('the document speaking to the engine', () => {
    it('passes the environment settings through', () => {
      const content = createSkyboxContent()
      content.environment = { intensity: 0.25, showBackground: false }

      mounted().apply(content)

      expect(environment.setIntensity).toHaveBeenCalledWith(0.25)
      expect(environment.setBackgroundVisible).toHaveBeenCalledWith(false)
    })

    it('recolours the sun in place, keeping the instance three was given', () => {
      const renderer = mounted()
      // The scene is only reachable through the group the test-objects mock captured.
      const light = probes.group.parent?.children.find(child => child instanceof DirectionalLight)
      if (!light) throw new Error('the renderer never put its sun in the scene')
      const instance = light.color
      const content = createSkyboxContent()
      content.sun = { ...content.sun, color: '#ff8800' }

      renderer.apply(content)

      expect(light.color).toBe(instance)
      expect(light.color.getHexString()).toBe('ff8800')
    })

    /** Everything BESIDES the picture is skipped too: two hundred frames cost one of each. */
    it('touches nothing else for a drag that only moves the sun', async () => {
      const renderer = mounted()
      const sky = skyOf('sky-1')
      await applied(renderer, sky)

      for (const frame of draggedSun(sky, 200)) renderer.apply(frame)
      await vi.advanceTimersByTimeAsync(0)

      expect(environment.setIntensity).toHaveBeenCalledTimes(1)
      expect(environment.setBackgroundVisible).toHaveBeenCalledTimes(1)
    })

    it('still recolours the sun on every frame of that drag', async () => {
      const renderer = mounted()
      const sky = skyOf('sky-1')
      await applied(renderer, sky)
      const light = probes.group.parent?.children.find(child => child instanceof DirectionalLight)

      for (const frame of draggedSun(sky, 3)) renderer.apply(frame)

      expect(light?.color.getHexString()).toBe('ff0002')
    })

    it('grades again as soon as an adjustment moves', async () => {
      const renderer = mounted()
      const sky = skyOf('sky-1')
      await applied(renderer, sky)
      const brighter = edited(sky, 'adjustments', { ...sky.adjustments, exposure: 1.7 })

      await applied(renderer, brighter)

      expect(environment.setAdjustments).toHaveBeenLastCalledWith(brighter.adjustments)
    })

    it('takes the backdrop away when the document turns it off', async () => {
      const renderer = mounted()
      const sky = skyOf('sky-1')
      await applied(renderer, sky)

      renderer.apply(edited(sky, 'environment', { ...sky.environment, showBackground: false }))

      expect(environment.setBackgroundVisible).toHaveBeenLastCalledWith(false)
    })

    it('follows the environment intensity once the sky is already up', async () => {
      const renderer = mounted()
      const sky = skyOf('sky-1')
      await applied(renderer, sky)

      renderer.apply(edited(sky, 'environment', { ...sky.environment, intensity: 0.25 }))

      expect(environment.setIntensity).toHaveBeenLastCalledWith(0.25)
    })
  })
})
