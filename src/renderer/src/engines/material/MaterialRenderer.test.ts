import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PerspectiveCamera, RepeatWrapping, Vector3 } from 'three'
import { PBR_CHANNELS, type PbrChannel } from '@shared/domain/material'
import type { ViewportEnvironment } from '../viewport/environment'
import { fakeEnvironment, fakeTextureSource } from '../viewport/viewport-fixtures'
import { ViewportEngine } from '../viewport/ViewportEngine'
import { MaterialRenderer } from './MaterialRenderer'
import { newMaterial, slotFor, type ChannelMap, type MaterialState } from './materialState'
import { NEUTRAL_ADJUSTMENTS } from '@shared/domain/adjustments'
import type { EnvironmentRef } from '@shared/domain/scene'
import type { EnvironmentDress } from '@shared/domain/skybox'

const MAP: Omit<ChannelMap, 'assetId'> = { origin: 'generated', width: 512, height: 512 }

const channelOf = (channel: PbrChannel, assetId: string): MaterialState => {
  const state = newMaterial()
  state.channels[channel] = { ...MAP, assetId }
  return state
}

/** All eight filled, which is what the loops in the engine actually have to handle. */
const everyChannel = (): MaterialState => {
  const state = newMaterial()
  for (const channel of PBR_CHANNELS) state.channels[channel] = { ...MAP, assetId: `${channel}-1` }
  return state
}

/** The one the engine is handed, so a test can read what it was told. */
let environment: ViewportEnvironment

/**
 * `mount` builds a real `WebGLRenderer`, which jsdom cannot give (`testSetup` hands back no canvas
 * context). Stubbing the viewport's mount and its `gl` accessor is enough — nothing here
 * dereferences the renderer, so what the engine decides is reachable and what it draws is not.
 */
vi.mock('../viewport/environment', () => ({
  createEnvironment: () => {
    environment = fakeEnvironment()
    return environment
  },
}))

const skyOf = (assetId: string): MaterialState => {
  const state = newMaterial()
  state.preview.environment = { kind: 'skybox', assetId }
  return state
}

/**
 * What the window resolves an environment to. A preview names a sky the same way a scene does, so
 * the engine takes the answer as a port rather than reaching for a store.
 */
const hung = (named: EnvironmentRef): EnvironmentDress | null =>
  named.kind === 'skybox'
    ? { assetId: named.assetId, adjustments: NEUTRAL_ADJUSTMENTS, sun: null, intensity: 0.5 }
    : null

let source: ReturnType<typeof fakeTextureSource>
let host: HTMLElement

beforeEach(() => {
  source = fakeTextureSource()
  vi.spyOn(ViewportEngine.prototype, 'mount').mockImplementation(() => {})
  // The mocked environment never reads the renderer fields.
  vi.spyOn(ViewportEngine.prototype, 'gl', 'get').mockReturnValue({} as never)
  host = document.createElement('div')
})

const mounted = (): MaterialRenderer => {
  const renderer = new MaterialRenderer({ loadTexture: source.load, environmentDress: hung })
  renderer.mount(host)
  return renderer
}

const applied = async (renderer: MaterialRenderer, state: MaterialState): Promise<void> => {
  const calls = source.load.mock.calls.length
  renderer.apply(state)
  await vi.waitFor(() => expect(source.load).toHaveBeenCalledTimes(calls + 1))
}

describe('the texture preview', () => {
  /**
   * The cache takes an asset id and builds the URL itself. Handing it one already built made it
   * encode the whole `ai-desktop-studio://` URL as an id, and the sky could never load.
   */
  it('asks for the sky by asset id, not by a URL it built itself', async () => {
    await applied(mounted(), skyOf('sky-1'))

    expect(source.load).toHaveBeenCalledWith('ai-desktop-studio://asset/sky-1', 'flipY')
  })

  /** Both halves: an orbit panned with the middle button aims elsewhere, and putting only the
   * camera back would show the same void it did before. */
  it('puts the camera and what it aims at back where the texture opened', () => {
    const camera = new PerspectiveCamera()
    vi.spyOn(ViewportEngine.prototype, 'camera', 'get').mockReturnValue(camera)
    const orbit = { target: new Vector3(), update: vi.fn() }
    vi.spyOn(ViewportEngine.prototype, 'orbit', 'get').mockReturnValue(orbit as never)
    const renderer = mounted()
    const home = camera.position.clone()

    camera.position.set(9, 9, 9)
    orbit.target.set(3, 0, 0)
    renderer.resetView()

    expect(camera.position.toArray()).toEqual(home.toArray())
    expect(orbit.target.toArray()).toEqual([0, 0, 0])
  })

  /** The branch a refactor would silently regress by moving the release inside the sky path. */
  it('frees its sky when the preview goes back to the studio', async () => {
    const renderer = mounted()
    await applied(renderer, skyOf('sky-1'))

    renderer.apply(newMaterial())

    expect(source.freed[0]).toHaveBeenCalled()
  })

  it('loads a sky once, however many times the same state comes back', async () => {
    const renderer = mounted()
    await applied(renderer, skyOf('sky-1'))
    renderer.apply(skyOf('sky-1'))

    expect(source.load).toHaveBeenCalledTimes(1)
  })

  /** The cache counts references: a sky nobody displays any more is memory the viewport lacks. */
  it('frees the previous sky when another one is chosen', async () => {
    const renderer = mounted()
    await applied(renderer, skyOf('sky-1'))

    await applied(renderer, skyOf('sky-2'))

    // After the swap, never before: until then the old texture is what the background holds.
    await vi.waitFor(() => expect(source.freed[0]).toHaveBeenCalled())
    expect(source.freed[1]).not.toHaveBeenCalled()
  })

  it('frees its sky when it goes away', async () => {
    const renderer = mounted()
    await applied(renderer, skyOf('sky-1'))

    renderer.dispose()

    expect(source.freed[0]).toHaveBeenCalled()
  })

  /**
   * The two surfaces must agree about the same sky: a scene renders it at `envIntensity` times
   * what the sky says, and a preview that dropped the second factor read a different world.
   */
  it('lights the preview at its own dial TIMES what the sky says', () => {
    const renderer = mounted()
    const state = skyOf('sky-1')
    state.preview.envIntensity = 2

    renderer.apply(state)

    expect(environment.setIntensity).toHaveBeenLastCalledWith(1)
  })

  /** Why the edge matters is in `applyEnvironment`; these three hold it to the three cases. */
  describe('the auto spin', () => {
    const spinning = (): MaterialState => {
      const state = newMaterial()
      state.preview.autoSpin = true
      return state
    }

    /** Already spinning, which is the state the clock must not be restarted from. */
    const spun = (): MaterialRenderer => {
      const renderer = mounted()
      renderer.apply(spinning())
      return renderer
    }

    /**
     * Cleared rather than created per test: `vi.spyOn` hands back the mock already installed on a
     * method, so a fresh `const` inside a test would read the count of the one before it — which
     * is what made the first version of these three pass on numbers that meant nothing.
     */
    const watchClock = () => {
      const reset = vi.spyOn(ViewportEngine.prototype, 'resetClock')
      reset.mockClear()
      return reset
    }

    it('starts the frame clock when the spin begins', () => {
      const reset = watchClock()

      mounted().apply(spinning())

      expect(reset).toHaveBeenCalledTimes(1)
    })

    it('leaves the clock alone while a setting is dragged under a spinning shape', () => {
      const renderer = spun()
      const reset = watchClock()

      // What a drag is: one `apply` per value, the spin untouched throughout.
      for (const roughness of [0.2, 0.4, 0.6]) {
        const dragged = spinning()
        dragged.material.roughness = roughness
        renderer.apply(dragged)
      }

      expect(reset).not.toHaveBeenCalled()
    })

    it('starts the clock again when the spin is turned off and back on', () => {
      const renderer = spun()
      renderer.apply(newMaterial())
      const reset = watchClock()

      renderer.apply(spinning())

      expect(reset).toHaveBeenCalledTimes(1)
    })
  })

  /**
   * The cavity mask reaches the shader through a uniform of its own, so it takes the one path in
   * this engine that no material slot walks. Covered channel by channel rather than for `edge`
   * alone: the loop is what decides, and it is the loop a refactor narrows by accident.
   */
  describe('the channels of a texture', () => {
    /**
     * All eight at once rather than one `it.each` per channel: it is the loop over `PBR_CHANNELS`
     * that decides, and proving it handles them *together* is what a per-channel case cannot say.
     */
    it('loads every channel, slot or no slot', async () => {
      const renderer = mounted()
      renderer.apply(everyChannel())

      await vi.waitFor(() => expect(source.load).toHaveBeenCalledTimes(PBR_CHANNELS.length))
      for (const channel of PBR_CHANNELS) {
        expect(source.load).toHaveBeenCalledWith(`ai-desktop-studio://asset/${channel}-1`, 'flipY')
      }
    })

    /**
     * Emptied while the eight loads are still in flight, which is the harder half: the cache frees
     * what arrives for a holder that no longer exists, so the disposal lands on resolution rather
     * than on the release — hence waiting for it instead of asserting straight away.
     */
    it('frees every channel when the texture is emptied', async () => {
      const renderer = mounted()
      renderer.apply(everyChannel())
      await vi.waitFor(() => expect(source.freed).toHaveLength(PBR_CHANNELS.length))

      renderer.apply(newMaterial())

      await vi.waitFor(() => {
        for (const freed of source.freed) expect(freed).toHaveBeenCalled()
      })
    })

    it('frees the cavity mask on dispose, which no slot would have done for it', async () => {
      const renderer = mounted()
      expect(slotFor('edge')).toBeNull()
      await applied(renderer, channelOf('edge', 'edge-1'))

      renderer.dispose()

      expect(source.freed[0]).toHaveBeenCalled()
    })

    it('swaps a channel for another asset without holding on to the first', async () => {
      const renderer = mounted()
      await applied(renderer, channelOf('edge', 'edge-1'))

      await applied(renderer, channelOf('edge', 'edge-2'))

      await vi.waitFor(() => expect(source.freed[0]).toHaveBeenCalled())
      expect(source.freed[1]).not.toHaveBeenCalled()
    })

    /**
     * Reads the texture the source handed out, which is the only way from here to tell a channel
     * that reached the shader from one that was merely loaded and dropped: repeat, offset and
     * rotation are applied to every map at once, so a channel left out drifts away from the rest.
     */
    it('applies the tiling of the material to every map at once', async () => {
      const renderer = mounted()
      const state = everyChannel()
      state.material.tiling = { x: 3, y: 3 }
      renderer.apply(state)
      await vi.waitFor(() => expect(source.load).toHaveBeenCalledTimes(PBR_CHANNELS.length))

      for (const result of source.load.mock.results) {
        const map = await result.value
        await vi.waitFor(() => expect(map.repeat.x).toBe(3))
        expect(map.wrapS).toBe(RepeatWrapping)
        expect(map.center.x).toBe(0.5)
      }
    })

    /**
     * A multiplier over the material's own repeat, never a replacement: the preview asks "how
     * does this look repeated", and the answer has to be the material's repeat seen more times.
     * Written into `material.tiling` instead, a glance would go out into a scene.
     */
    it('multiplies the repeat by the preview, on every map at once', async () => {
      const renderer = mounted()
      const state = everyChannel()
      // Asymmetric on purpose: at 3 by 3 the assertion holds with the two axes swapped.
      state.material.tiling = { x: 3, y: 5 }
      state.preview.tilingPreview = 4
      renderer.apply(state)
      await vi.waitFor(() => expect(source.load).toHaveBeenCalledTimes(PBR_CHANNELS.length))

      for (const result of source.load.mock.results) {
        const map = await result.value
        await vi.waitFor(() => expect(map.repeat.x).toBe(12))
        expect(map.repeat.y).toBe(20)
      }
      // And the document keeps what its author chose.
      expect(state.material.tiling).toEqual({ x: 3, y: 5 })
    })
  })

  describe('the placement and lifetime of texture channels', () => {
    /**
     * Half a width and half a height is exactly what brings a wrap edge to the middle of the
     * frame. On every map at once, or the relief stops matching the picture it lifts.
     */
    it('brings the seams to the middle without touching the material offset', async () => {
      const renderer = mounted()
      const state = everyChannel()
      state.material.offset = { x: 0.25, y: 0 }
      state.preview.showSeam = true
      renderer.apply(state)
      await vi.waitFor(() => expect(source.load).toHaveBeenCalledTimes(PBR_CHANNELS.length))

      for (const result of source.load.mock.results) {
        const map = await result.value
        await vi.waitFor(() => expect(map.offset.x).toBe(0.75))
        expect(map.offset.y).toBe(0.5)
      }
      expect(state.material.offset).toEqual({ x: 0.25, y: 0 })
    })

    /**
     * The regression this exists for, measured rather than supposed: `Texture.needsUpdate` bumps
     * `source.needsUpdate` too, so three re-uploads the pixels AND rebuilds the mip chain. Set on
     * every `apply`, eight 2K channels came to 128 MB of upload per frame of any drag — four to ten
     * times the whole frame budget, for a slider that has nothing to do with tiling.
     *
     * Nothing here needs it: `matrixAutoUpdate` is on, so three refreshes the uv matrix itself.
     */
    it('never asks for a re-upload of pixels it has not changed', async () => {
      const renderer = mounted()
      await applied(renderer, channelOf('baseColor', 'base-1'))
      const map = await source.load.mock.results[0]?.value

      // Whatever the first render needed is spent; from here on a version bump IS a re-upload.
      const version = map.version

      // The tiling moves, so the pass really does run and really does rewrite `repeat` — which is
      // the case that matters: placing a map again must not cost its pixels. Asserted on a state
      // that does NOT move would only have re-tested the guard above it.
      const moved = channelOf('baseColor', 'base-1')
      moved.material.tiling = { x: 2, y: 2 }
      renderer.apply(moved)

      expect(map.repeat.x).toBe(2)
      expect(map.version).toBe(version)
    })

    it('leaves the maps alone entirely when the tiling has not moved', async () => {
      const renderer = mounted()
      await applied(renderer, channelOf('baseColor', 'base-1'))
      const map = await source.load.mock.results[0]?.value
      map.repeat.set(9, 9)

      // Same tiling as before, so the pass must not run — not even to write the same values back.
      renderer.apply(channelOf('baseColor', 'base-1'))

      expect(map.repeat.x).toBe(9)
    })

    it('still follows the tiling when it does move', async () => {
      const renderer = mounted()
      await applied(renderer, channelOf('baseColor', 'base-1'))
      const map = await source.load.mock.results[0]?.value

      const moved = channelOf('baseColor', 'base-1')
      moved.material.tiling = { x: 4, y: 2 }
      renderer.apply(moved)

      expect([map.repeat.x, map.repeat.y]).toEqual([4, 2])
    })

    /**
     * A 4K picture decodes for hundreds of milliseconds. The state that started the load is stale
     * by the time it resolves, and reapplying it snapped every other map back to a tiling the user
     * had already left.
     */
    it('places a map that arrives late on the tiling in force, not the one it was asked under', async () => {
      const renderer = mounted()
      const asked = channelOf('baseColor', 'base-1')
      renderer.apply(asked)

      const moved = channelOf('baseColor', 'base-1')
      moved.material.tiling = { x: 5, y: 5 }
      renderer.apply(moved)

      const map = await source.load.mock.results[0]?.value
      await vi.waitFor(() => expect(map.repeat.x).toBe(5))
    })

    it('asks once for a channel, however many times the same state comes back', async () => {
      const renderer = mounted()
      await applied(renderer, channelOf('roughness', 'rough-1'))

      renderer.apply(channelOf('roughness', 'rough-1'))

      expect(source.load).toHaveBeenCalledTimes(1)
    })

    /**
     * A channel opened in Images, painted and saved keeps its id — so nothing here would ever ask
     * for it again, and the preview judged a material on the picture the edit replaced.
     */
    it('reads a channel again once the catalogue says its picture was rewritten', async () => {
      let version = 'before'
      const renderer = new MaterialRenderer({
        loadTexture: source.load,
        assetVersion: () => version,
      })
      renderer.mount(host)
      await applied(renderer, channelOf('baseColor', 'base-1'))

      renderer.refreshMaps()
      expect(source.load).toHaveBeenCalledTimes(1)

      version = 'after'
      renderer.refreshMaps()

      await vi.waitFor(() => expect(source.load).toHaveBeenCalledTimes(2))
      expect(source.load).toHaveBeenLastCalledWith('ai-desktop-studio://asset/base-1?v=after', 'flipY')
    })
  })
})
