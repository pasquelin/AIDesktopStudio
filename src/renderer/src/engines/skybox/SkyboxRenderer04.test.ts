// @vitest-environment jsdom

import { WebGLRenderTarget } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
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

describe('the test objects of a skybox', () => {
  const mountedRenderers: SkyboxRenderer[] = []
  let painted: MockInstance<() => void>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Watched from `mount`, which is where the viewport this renderer built becomes reachable:
    // `requestRender` is an instance field, so the prototype carries nothing to spy on.
    vi.spyOn(ViewportEngine.prototype, 'mount').mockImplementation(function (this: ViewportEngine) {
      painted = vi.spyOn(this, 'requestRender')
    })
    vi.spyOn(ViewportEngine.prototype, 'gl', 'get').mockReturnValue({} as never)
    vi.spyOn(ViewportEngine.prototype, 'canvas', 'get').mockReturnValue(
      document.createElement('canvas'),
    )
  })

  afterEach(() => {
    for (const renderer of mountedRenderers.splice(0)) renderer.dispose()
    vi.useRealTimers()
  })

  const mounted = (): SkyboxRenderer => {
    const renderer = new SkyboxRenderer({
      onSunChange: vi.fn(),
      loadTexture: fakeTextureSource().load,
    })
    renderer.mount(document.createElement('div'))
    mountedRenderers.push(renderer)
    return renderer
  }

  const withSky = (): SkyboxContent => {
    const content = createSkyboxContent()
    content.source = { assetId: 'sky-1' }
    return content
  }

  it('shows nothing to judge until a sky is placed', () => {
    mounted().apply(createSkyboxContent())

    expect(probes.group.visible).toBe(false)
  })

  it('shows them once a sky is placed', () => {
    mounted().apply(withSky())

    expect(probes.group.visible).toBe(true)
  })

  /**
   * And when it arrives on a later frame. Placing a sky is its own edit — `setSource`
   * (`skybox/commands.ts:73`) replaces that section and leaves the other three where they were,
   * so nothing but the sky itself tells the probes to look again.
   */
  it('shows them when the sky arrives after the document opened empty', () => {
    const renderer = mounted()
    const empty = createSkyboxContent()
    renderer.apply(empty)

    renderer.apply(edited(empty, 'source', { assetId: 'sky-1' }))

    expect(probes.group.visible).toBe(true)
  })

  /** The setting still wins: asked to hide them, they stay hidden with a sky in place. */
  it('keeps them hidden when the setting says so', () => {
    const renderer = mounted()

    renderer.setProbesVisible(false)
    renderer.apply(withSky())

    expect(probes.group.visible).toBe(false)
  })

  /**
   * Seen on screen on 19 August: the spheres stayed put. This viewport draws only when asked, and
   * taking them away moves nothing else that would ask.
   */
  it('paints the frame again when the setting takes them away', () => {
    const renderer = mounted()
    renderer.apply(withSky())
    painted.mockClear()

    renderer.setProbesVisible(false)

    expect(painted).toHaveBeenCalled()
  })

  /** And they go again when the sky is taken away — the empty state comes back with them. */
  it('hides them again when the sky is removed', () => {
    const renderer = mounted()
    const sky = withSky()
    renderer.apply(sky)

    renderer.apply(edited(sky, 'source', null))

    expect(probes.group.visible).toBe(false)
  })
})

/**
 * A flat view is a quad over the frame, so what sits behind it is worth nothing — and worse
 * than nothing for the backdrop: the projection letterboxes its picture, and the immersive sky
 * showing through the bars would read as part of what is being judged.
 */
describe('the views of a skybox', () => {
  const mountedRenderers: SkyboxRenderer[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.spyOn(ViewportEngine.prototype, 'mount').mockImplementation(() => {})
    vi.spyOn(ViewportEngine.prototype, 'gl', 'get').mockReturnValue({} as never)
    vi.spyOn(ViewportEngine.prototype, 'canvas', 'get').mockReturnValue(
      document.createElement('canvas'),
    )
  })

  afterEach(() => {
    for (const renderer of mountedRenderers.splice(0)) renderer.dispose()
    vi.useRealTimers()
  })

  const withSky = (): SkyboxContent => {
    const content = createSkyboxContent()
    content.source = { assetId: 'sky-1' }
    return content
  }

  const mounted = (): SkyboxRenderer => {
    const renderer = new SkyboxRenderer({
      onSunChange: vi.fn(),
      loadTexture: fakeTextureSource().load,
    })
    renderer.mount(document.createElement('div'))
    mountedRenderers.push(renderer)
    renderer.apply(withSky())
    return renderer
  }

  it('drops the backdrop and the probes for a flat view', () => {
    const renderer = mounted()

    renderer.setView('cross')

    expect(environment.setBackgroundVisible).toHaveBeenLastCalledWith(false)
    expect(probes.group.visible).toBe(false)
  })

  it('gives them back on the way home', () => {
    const renderer = mounted()

    renderer.setView('faces')
    renderer.setView('immersive')

    expect(environment.setBackgroundVisible).toHaveBeenLastCalledWith(true)
    expect(probes.group.visible).toBe(true)
  })

  /** What the document asked of the backdrop is not forgotten while a flat view is on. */
  it('does not turn a backdrop back on that the document had turned off', () => {
    const renderer = mounted()
    const content = withSky()
    content.environment = { ...content.environment, showBackground: false }
    renderer.apply(content)

    renderer.setView('equirect')
    renderer.setView('immersive')

    expect(environment.setBackgroundVisible).toHaveBeenLastCalledWith(false)
  })

  /** Nothing is drawn over the immersive view — it IS the scene. */
  it('draws no projection in the immersive view', () => {
    mounted()

    expect(pipeline.renderToScreen).not.toHaveBeenCalled()
  })
})
