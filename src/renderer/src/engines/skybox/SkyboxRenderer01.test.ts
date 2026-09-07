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

const skyOf = (assetId: string): SkyboxContent => {
  const content = createSkyboxContent()
  content.source = { assetId }
  return content
}

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

  /** What the engine asked of the SHELF — the floor's grid, read at construction, is not that. */
  const skyLoads = (): string[] =>
    source.load.mock.calls.map(([url]) => url).filter(url => url.startsWith(ASSET_URL))

  describe('mounting', () => {
    it('builds nothing when the viewport has no renderer to share', () => {
      unmountable()

      expect(pipeline.createTarget).not.toHaveBeenCalled()
    })

    /**
     * A document can reach the engine before the viewport has a renderer, and everything `apply`
     * does then falls on the floor. Mounting has to put it back — recognising the content and
     * skipping it would open the sky on its defaults with nothing to say so.
     */
    it('applies the document again when it arrived before the renderer did', () => {
      const renderer = new SkyboxRenderer({ onSunChange, loadTexture: source.load })
      mountedRenderers.push(renderer)
      const content = skyOf('sky-1')
      content.environment = { intensity: 0.25, showBackground: false }
      vi.spyOn(ViewportEngine.prototype, 'gl', 'get').mockReturnValueOnce(null)
      renderer.mount(host)
      renderer.apply(content)
      vi.clearAllMocks()

      renderer.mount(host)

      expect(environment.setIntensity).toHaveBeenCalledWith(0.25)
      expect(environment.setBackgroundVisible).toHaveBeenCalledWith(false)
    })

    // The pipeline is for the FLAT views alone now; the grading target belongs to `skyGrading`.
    it('builds no grading target of its own', () => {
      mounted()

      expect(pipeline.createTarget).not.toHaveBeenCalled()
    })
  })

  describe('the source picture', () => {
    // Handing the cache a URL it had built itself made it encode the whole `ai-desktop-studio://` address
    // as an asset id, and no sky could ever load.
    it('asks for the sky by asset id, not by a URL it built itself', async () => {
      await applied(mounted(), skyOf('sky-1'))

      expect(source.load).toHaveBeenCalledWith(`${ASSET_URL}sky-1`, 'flipY')
    })

    /**
     * A panorama opened in Images, retouched and saved keeps its id, so the engine would never
     * ask for it again — the sky judged an edit that had already happened.
     */
    it('reads the picture again once the catalogue says it was rewritten', async () => {
      let version = 'before'
      const renderer = new SkyboxRenderer({
        onSunChange,
        loadTexture: source.load,
        assetVersion: () => version,
      })
      mountedRenderers.push(renderer)
      renderer.mount(host)
      await applied(renderer, skyOf('sky-1'))

      renderer.refreshSource()
      expect(skyLoads()).toHaveLength(1)

      version = 'after'
      renderer.refreshSource()

      await vi.advanceTimersByTimeAsync(0)
      expect(source.load).toHaveBeenLastCalledWith(`${ASSET_URL}sky-1?v=after`, 'flipY')
    })

    it('hangs the picture it was given, and prefilters it on the spot', async () => {
      await applied(mounted(), skyOf('sky-1'))

      expect(environment.setTexture).toHaveBeenCalledWith(expect.any(Texture))
      // A picture LANDING is rare enough to pay for at once; the drag that must not is a dial.
      expect(environment.refresh).toHaveBeenCalled()
    })

    /**
     * The grading lives in `ViewportEnvironment`, which the SCENE reads too — one description of
     * what a sky is worth, not two. What this engine owes is handing its stack over.
     */
    it('hands the adjustments to the environment, which grades and prefilters', async () => {
      const content = skyOf('sky-1')
      content.adjustments = { ...content.adjustments, exposure: 1.7 }

      await applied(mounted(), content)

      expect(environment.setAdjustments).toHaveBeenCalledWith(content.adjustments)
    })

    it('takes the picture away when the document names none', async () => {
      const renderer = mounted()
      await applied(renderer, skyOf('sky-1'))

      renderer.apply(createSkyboxContent())

      expect(environment.setTexture).toHaveBeenLastCalledWith(null)
    })

    it('loads a sky once, however many times the same state comes back', async () => {
      const renderer = mounted()
      await applied(renderer, skyOf('sky-1'))

      renderer.apply(skyOf('sky-1'))

      expect(skyLoads()).toHaveLength(1)
    })

    it('frees the previous sky when another one is chosen', async () => {
      const renderer = mounted()
      await applied(renderer, skyOf('sky-1'))

      await applied(renderer, skyOf('sky-2'))

      expect(source.freedFor(`${ASSET_URL}sky-1`)).toHaveBeenCalled()
      expect(source.freedFor(`${ASSET_URL}sky-2`)).not.toHaveBeenCalled()
    })

    it('takes the background away when the picture goes', async () => {
      const renderer = mounted()
      await applied(renderer, skyOf('sky-1'))

      renderer.apply(createSkyboxContent())

      expect(environment.setTexture).toHaveBeenCalledWith(null)
    })

    it('asks for nothing on a document that never had a picture', () => {
      mounted().apply(createSkyboxContent())

      expect(skyLoads()).toEqual([])
      expect(environment.setTexture).not.toHaveBeenCalled()
    })

    /**
     * The document may move on while a texture is in flight. Two things keep the loser out —
     * the engine's check on arrival, and the cache resolving to `null` once the last holder let
     * go — so this pins the behaviour, not either mechanism.
     */
    it('drops a texture that arrives after the document moved on', async () => {
      const renderer = mounted()
      let arrive: () => void = () => {}
      source.load.mockImplementationOnce(
        () => new Promise(resolve => (arrive = () => resolve(new Texture()))),
      )

      renderer.apply(skyOf('slow'))
      await applied(renderer, skyOf('quick'))
      arrive()
      // Drained, not merely awaited: the stale `then` runs on a later microtask, and asserting
      // before it does would pass whether the guard is there or not.
      await vi.advanceTimersByTimeAsync(0)

      // One picture hung, the quick one — the slow arrival must reach the environment with nothing.
      expect(environment.setTexture).toHaveBeenLastCalledWith(expect.any(Texture))
      expect(environment.refresh).toHaveBeenCalledTimes(1)
    })

    it('grades nothing while the viewport has no pipeline', async () => {
      const renderer = unmountable()

      renderer.apply(skyOf('sky-1'))
      await vi.advanceTimersByTimeAsync(0)

      expect(skyLoads()).toHaveLength(1)
      expect(pipeline.renderTo).not.toHaveBeenCalled()
    })
  })
})
