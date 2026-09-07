import { SRGBColorSpace, Texture, type ColorSpace } from 'three'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { NEUTRAL_ADJUSTMENTS } from '@shared/domain/adjustments'
import type { EnvironmentDress } from '@shared/domain/skybox'
import { createTextureCache } from '../scene/textureCache'
import { createSkyBinding } from './skyBinding'
import { fakeEnvironment, fakeTextureSource } from './viewport-fixtures'

/** A picture hung on its own — what `environmentDressOf` answers for a `skybox` reference. */
const hung = (assetId: string): EnvironmentDress => ({
  assetId,
  adjustments: NEUTRAL_ADJUSTMENTS,
  sun: null,
  intensity: 1,
})

const SKY = hung('sky-1')
const OTHER = hung('sky-2')
const THIRD = hung('sky-3')
/** The procedural studio: a scene naming no sky, and one whose sky has not landed yet. */
const STUDIO = null

let source: ReturnType<typeof fakeTextureSource>
let paint: Mock<() => void>

beforeEach(() => {
  source = fakeTextureSource()
  paint = vi.fn()
})

/** The failure port: what a cache tells its engine is that engine's business, not this one's. */
const silent = () => {}

const binding = () => createSkyBinding(createTextureCache(source.load, silent), paint)

describe('createSkyBinding loading', () => {
  it('asks for the sky by asset id, and prefilters it once it has decoded', async () => {
    const environment = fakeEnvironment()
    await binding().apply(environment, SKY)

    expect(source.load).toHaveBeenCalledWith('ai-desktop-studio://asset/sky-1', 'flipY')
    expect(environment.setTexture).toHaveBeenCalled()
    expect(environment.refresh).toHaveBeenCalled()
  })

  /**
   * The grading of a sky moves while its picture does not — an exposure turned in the sky's own
   * tab. Pushed after the « already shown » shortcut, the scene would keep the raw picture until
   * the sky was swapped for another.
   */
  it('pushes the grading even when the picture has not moved', async () => {
    const sky = binding()
    const environment = fakeEnvironment()
    const graded = { ...SKY, adjustments: { ...NEUTRAL_ADJUSTMENTS, exposure: 1.5 } }

    await sky.apply(environment, SKY)
    await sky.apply(environment, graded)

    expect(environment.setAdjustments).toHaveBeenLastCalledWith(graded.adjustments)
    expect(source.load).toHaveBeenCalledTimes(1)
  })

  it('grades nothing for a scene lit by the procedural studio', async () => {
    const environment = fakeEnvironment()

    await binding().apply(environment, STUDIO)

    expect(environment.setAdjustments).toHaveBeenCalledWith(NEUTRAL_ADJUSTMENTS)
  })

  it('reads the file once, however many times the same choice comes back', async () => {
    const sky = binding()
    const environment = fakeEnvironment()

    await sky.apply(environment, SKY)
    await sky.apply(environment, SKY)

    expect(source.load).toHaveBeenCalledTimes(1)
  })

  /**
   * A sky edited in Images and saved keeps its id, so « already shown » was true forever: the
   * backdrop stayed on the picture the edit replaced until the document was reopened.
   */
  it('reads the file again once the catalogue says it was rewritten', async () => {
    let version = 'before'
    const sky = createSkyBinding(
      createTextureCache(source.load, silent, () => version),
      paint,
    )
    const environment = fakeEnvironment()

    await sky.apply(environment, SKY)
    await sky.refresh()
    expect(source.load).toHaveBeenCalledTimes(1)

    version = 'after'
    await sky.refresh()

    expect(source.load).toHaveBeenCalledTimes(2)
    expect(source.load).toHaveBeenLastCalledWith('ai-desktop-studio://asset/sky-1?v=after', 'flipY')
  })

  it('refreshes nothing before a sky has been asked for', async () => {
    await binding().refresh()

    expect(source.load).not.toHaveBeenCalled()
  })

  /**
   * A 4K panorama decodes for hundreds of milliseconds, so a ⌘S landing mid-decode puts TWO loads
   * of the same sky in flight. Settled by asset id, the older one wins whenever it resolves last —
   * and the backdrop stays on exactly the picture the edit replaced.
   */
  it('shows the newer version even when the older one decodes last', async () => {
    let version = 'v1'
    const settle = new Map<string, (texture: Texture) => void>()
    const load = vi.fn((url: string) => new Promise<Texture>(resolve => settle.set(url, resolve)))
    const sky = createSkyBinding(
      createTextureCache(load, silent, () => version),
      paint,
    )
    const environment = fakeEnvironment()

    const first = sky.apply(environment, SKY)
    version = 'v2'
    const second = sky.apply(environment, SKY)

    const newer = new Texture()
    settle.get('ai-desktop-studio://asset/sky-1?v=v2')?.(newer)
    settle.get('ai-desktop-studio://asset/sky-1?v=v1')?.(new Texture())
    await Promise.all([first, second])

    expect(environment.setTexture).toHaveBeenLastCalledWith(newer)
  })

  /**
   * `setStudio` lights the scene but hangs nothing behind it. Without repainting, the backdrop
   * stayed on the texture that was just cleared — which reads as a viewport gone black.
   */
  it('paints a backdrop again when it goes back to the studio', async () => {
    const sky = binding()
    const environment = fakeEnvironment()

    await sky.apply(environment, SKY)
    paint.mockClear()
    await sky.apply(environment, STUDIO)

    expect(environment.setTexture).toHaveBeenLastCalledWith(null)
    expect(environment.setStudio).toHaveBeenCalled()
    expect(paint).toHaveBeenCalled()
  })

  it('says whether a sky owns the background, which is what stops a repaint over it', async () => {
    const sky = binding()
    expect(sky.showsSky()).toBe(false)

    await sky.apply(fakeEnvironment(), SKY)
    expect(sky.showsSky()).toBe(true)
  })

  /**
   * Released before its replacement is in place, a sky is disposed while still bound to
   * `scene.background`: three.js re-uploads it on the next frame, with nothing left to free it.
   */
  it('frees the previous sky only once the new one is shown', async () => {
    const sky = binding()
    const environment = fakeEnvironment()

    await sky.apply(environment, SKY)
    expect(source.freed[0]).not.toHaveBeenCalled()

    await sky.apply(environment, OTHER)
    expect(source.freed[0]).toHaveBeenCalled()
    expect(source.freed[1]).not.toHaveBeenCalled()
  })

  it('frees the sky it holds when the viewport goes away', async () => {
    const sky = binding()
    await sky.apply(fakeEnvironment(), SKY)

    sky.release()

    expect(source.freed[0]).toHaveBeenCalled()
    expect(sky.showsSky()).toBe(false)
  })

  // A sky chosen while another is still decoding must not be overwritten by the slower one.
  it('lets the last choice win, whatever order they decode in', async () => {
    const sky = binding()
    const environment = fakeEnvironment()

    const first = sky.apply(environment, SKY)
    const second = sky.apply(environment, OTHER)
    await Promise.all([first, second])

    expect(sky.showsSky()).toBe(true)
    expect(environment.refresh).toHaveBeenCalledTimes(1)
  })

  /**
   * Two skies never showed this: the first one holds no predecessor, so nothing is owed. It takes
   * a third to overtake a choice that is *already* carrying one — and a sky whose reference is
   * never given back stays in GPU memory until the engine is disposed of.
   */
  it('gives back the sky an overtaken choice was carrying', async () => {
    const sky = binding()
    const environment = fakeEnvironment()

    const first = sky.apply(environment, SKY)
    const second = sky.apply(environment, OTHER)
    const third = sky.apply(environment, THIRD)
    await Promise.all([first, second, third])

    expect(source.freed[0]).toHaveBeenCalled()
    expect(source.freed[1]).toHaveBeenCalled()
    expect(source.freed[2]).not.toHaveBeenCalled()
    expect(sky.showsSky()).toBe(true)
  })
})

describe('createSkyBinding ownership', () => {
  /**
   * The ordering rule this module exists for, in the case a losing call can break it: sky-1 is on
   * the background while 2 and 3 decode, and 2 resolves first. Whatever 2 gives back, it must not
   * be the picture three.js is still drawing from.
   */
  it('never frees the sky on screen before its replacement is shown', async () => {
    const sky = binding()
    const environment = fakeEnvironment()
    await sky.apply(environment, SKY)

    const second = sky.apply(environment, OTHER)
    const third = sky.apply(environment, THIRD)
    await Promise.all([second, third])

    const shown = vi.mocked(environment.setTexture).mock.invocationCallOrder.at(-1) ?? 0
    const freedFirst = source.freed[0]?.mock.invocationCallOrder[0] ?? 0
    expect(freedFirst).toBeGreaterThan(shown)
  })

  /**
   * The mirror risk of giving a carried reference back: hand back one too many and the sky on
   * screen is disposed of under the frame that is drawing it. Coming back to a sky while another
   * decodes is the case where the same asset is both carried and wanted.
   */
  it('keeps the sky that came back while another was decoding', async () => {
    const sky = binding()
    const environment = fakeEnvironment()

    const first = sky.apply(environment, SKY)
    const second = sky.apply(environment, OTHER)
    const back = sky.apply(environment, SKY)
    await Promise.all([first, second, back])

    expect(source.freed[0]).not.toHaveBeenCalled()
    expect(source.freed[1]).toHaveBeenCalled()
    expect(sky.showsSky()).toBe(true)
  })

  /**
   * The cache is shared with the material slots of the same engine, so a sky can be held twice
   * over. Handing one reference back twice — once by `release`, once by the load it interrupted —
   * would drop the count to zero under the other holder and free a texture still in use.
   */
  it('gives a reference back once when a release interrupts a load', async () => {
    const cache = createTextureCache(source.load, silent)
    const sky = createSkyBinding(cache, paint)
    const alsoHeld = await cache.acquire('sky-1', SRGBColorSpace)

    const inFlight = sky.apply(fakeEnvironment(), SKY)
    sky.release()
    await inFlight

    expect(alsoHeld).not.toBeNull()
    expect(source.freed[0]).not.toHaveBeenCalled()
  })

  /** One name could hold one decode. Two in flight and the earlier one was never given back. */
  it('gives back every sky still decoding, not just the last one asked for', async () => {
    const sky = binding()
    const environment = fakeEnvironment()

    const first = sky.apply(environment, SKY)
    const second = sky.apply(environment, OTHER)
    sky.release()
    await Promise.all([first, second])

    expect(source.freed[0]).toHaveBeenCalled()
    expect(source.freed[1]).toHaveBeenCalled()
  })

  /**
   * A failed load holds nothing: `ref-cache` drops the entry. Left claimed, `release` would give
   * back a reference this binding never took — and free the sky under whoever else holds it.
   */
  it('claims nothing after a load that failed', async () => {
    let fail = true
    const cache = createTextureCache(async url => {
      if (fail) throw new Error('gone')
      return source.load(url)
    }, silent)
    const sky = createSkyBinding(cache, paint)
    await sky.apply(fakeEnvironment(), SKY)

    fail = false
    const alsoHeld = await cache.acquire('sky-1', SRGBColorSpace)
    sky.release()

    expect(alsoHeld).not.toBeNull()
    expect(source.freed[0]).not.toHaveBeenCalled()
  })

  /** `ref-cache` promises the next acquire tries again; a latched id would deny it for good. */
  it('lets a sky that failed be asked for again', async () => {
    let fail = true
    const cache = createTextureCache(async url => {
      if (fail) throw new Error('gone')
      return source.load(url)
    }, silent)
    const sky = createSkyBinding(cache, paint)
    const environment = fakeEnvironment()
    await sky.apply(environment, SKY)

    fail = false
    await sky.apply(environment, SKY)

    expect(environment.refresh).toHaveBeenCalled()
  })

  /**
   * A sky that failed does not unpaint the one before it. `SceneRenderer.applyPalette` repaints
   * the backdrop on every apply and asks this first — answering no here would flatten a sky that
   * is still hanging behind the scene.
   */
  it('still owns the background when the next sky fails to load', async () => {
    let fail = false
    const cache = createTextureCache(async url => {
      if (fail) throw new Error('gone')
      return source.load(url)
    }, silent)
    const sky = createSkyBinding(cache, paint)
    const environment = fakeEnvironment()
    await sky.apply(environment, SKY)

    fail = true
    await sky.apply(environment, OTHER)

    expect(sky.showsSky()).toBe(true)
  })

  /**
   * Failed and overtaken at once: `ref-cache` dropped the entry, so this call holds nothing to
   * give. Handing one back anyway takes the count to zero under whoever re-acquired the sky in
   * the meantime — a window of one microtask, and the cache is shared with the material slots.
   */
  it('gives nothing back for a sky that both failed and lost the race', async () => {
    let fail = true
    const cache = createTextureCache(async url => {
      if (fail) throw new Error('gone')
      return source.load(url)
    }, silent)

    const released: string[] = []
    const watched = {
      acquire: cache.acquire,
      release: (assetId: string, colorSpace: ColorSpace) => {
        released.push(assetId)
        cache.release(assetId, colorSpace)
      },
      versionOf: cache.versionOf,
      dispose: cache.dispose,
    }
    const sky = createSkyBinding(watched, paint)
    const environment = fakeEnvironment()

    const failing = sky.apply(environment, SKY)
    fail = false
    const winner = sky.apply(environment, OTHER)
    await Promise.all([failing, winner])

    expect(released).not.toContain('sky-1')
  })

  it('shows nothing rather than throwing when the file cannot be read', async () => {
    const sky = createSkyBinding(
      createTextureCache(async () => {
        throw new Error('gone')
      }, silent),
      paint,
    )
    const environment = fakeEnvironment()

    await sky.apply(environment, SKY)

    expect(environment.refresh).not.toHaveBeenCalled()
  })
})
