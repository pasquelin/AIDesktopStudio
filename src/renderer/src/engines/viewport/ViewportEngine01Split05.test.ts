import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A renderer jsdom can hold: the real one asks the canvas for a WebGL context and gets null.
 * Only what the engine reads back is kept — the element it draws into, the two flags it sets at
 * mount, `autoClear`, which the overlay pass turns off and back on, and `info`.
 *
 * `info` follows three.js 0.185.1 to the letter, because the counting depends on it: `render`
 * clears the counters first when `autoReset` is on, then adds one draw call. A viewport with an
 * overlay calls `render` twice, so a stand-in that skipped the clearing would report a passing
 * count for a viewport that measures only its trihedron.
 */
import {
  contextLost,
  disposed,
  queryBegun,
  queryEnded,
  rendered,
  resetShadowDraws,
  setDisplayRatio,
  ViewportEngine,
} from './viewportEngineTest-fixtures'
import { GPU_TIMED_FRAMES } from './viewportEngineSupport1'

describe('a viewport', () => {
  let host: HTMLElement

  let frames: Map<number, FrameRequestCallback>

  let nextHandle: number

  let engines: ViewportEngine[]

  let observations: (() => void)[]

  beforeEach(() => {
    vi.clearAllMocks()
    resetShadowDraws()
    // `performance` among them: the preview holds itself to a cadence, and a clock the test
    // cannot move would make that cadence depend on how fast the machine ran the assertions.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
    setDisplayRatio(1)
    host = document.createElement('div')
    document.body.appendChild(host)
    engines = []

    // Frames are run by hand: a viewport that only draws on demand is unobservable otherwise,
    // and a real `requestAnimationFrame` never fires under a test runner.
    frames = new Map()
    nextHandle = 1
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(nextHandle, callback)
      return nextHandle++
    })
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => frames.delete(handle))

    // Broadcast by hand for the same reason: the browser delivers observations after the frame
    // callbacks of the turn that is about to paint, and that order is what this file measures.
    observations = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: ResizeObserverCallback) {}

        // Recorded on `observe` and not in the constructor: an engine that built an observer and
        // never pointed it at its canvas would follow nothing, and would still read as green.
        observe(): void {
          observations.push(() => this.callback([], this))
        }

        unobserve(): void {}
        disconnect(): void {}
      },
    )
  })

  afterEach(() => {
    for (const engine of engines) engine.dispose()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    host.remove()
  })

  const mounted = (options?: ConstructorParameters<typeof ViewportEngine>[0]): ViewportEngine => {
    const engine = new ViewportEngine(options)
    engine.mount(host)
    engines.push(engine)
    return engine
  }

  const atRest = (options?: ConstructorParameters<typeof ViewportEngine>[0]): ViewportEngine => {
    const engine = mounted(options)
    drawFrames()
    return engine
  }

  const drawFrames = (): void => {
    const pending = [...frames.values()]
    frames.clear()
    for (const frame of pending) frame(performance.now())
  }

  const observeResize = (): void => {
    for (const observation of observations) observation()
  }

  describe('before it is mounted', () => {
    it('has no canvas, no renderer and no orbit', () => {
      const engine = new ViewportEngine()

      expect(engine.canvas).toBeNull()
      expect(engine.gl).toBeNull()
      expect(engine.orbit).toBeNull()
    })

    /** A panel that is still laying out has no surface: no ray may be cast through it. */
    it('places no pointer and reads no palette token', () => {
      const engine = new ViewportEngine()

      expect(engine.pointerNdcOf({ clientX: 10, clientY: 10 })).toBeNull()
      expect(engine.paletteToken('panel')).toBe('')
    })

    it('asks for no frame', () => {
      new ViewportEngine().requestRender()

      expect(frames.size).toBe(0)
    })
  })

  describe('the frame loop', () => {
    it('asks for one frame however many times it is nudged', () => {
      const engine = atRest({ controls: 'none' })

      engine.requestRender()
      engine.requestRender()
      engine.requestRender()

      expect(frames.size).toBe(1)
    })

    /** A studio whose viewport burns a frame at rest heats the machine for nothing. */
    it('goes back to sleep once nothing moves', () => {
      mounted({ controls: 'none', onFrame: () => false })

      drawFrames()

      expect(rendered).toHaveBeenCalled()
      expect(frames.size).toBe(0)
    })

    it('keeps drawing while something is still moving', () => {
      mounted({ controls: 'none', onFrame: () => true })

      drawFrames()

      expect(frames.size).toBe(1)
    })

    /**
     * The gap a resting viewport leaves is however long the user was away, not a frame. Left on
     * the clock, the next run of the loop opens on a `MAX_DELTA` jump — and every caller that
     * starts an animation would have to remember `resetClock` to avoid it.
     */
    it('opens a new run of the loop from rest, not on the time it spent asleep', () => {
      const onFrame = vi.fn(() => false)
      const clock = vi.spyOn(performance, 'now').mockReturnValue(1_000)
      const engine = atRest({ controls: 'none', onFrame })

      // Five seconds away, then something asks for a frame again.
      clock.mockReturnValue(6_000)
      engine.requestRender()
      drawFrames()

      expect(onFrame).toHaveBeenLastCalledWith(0)
      clock.mockRestore()
    })

    it('draws the overlay without clearing what is under it', () => {
      let clearedDuringOverlay = true
      const engine = mounted({
        controls: 'none',
        onOverlay: renderer => (clearedDuringOverlay = renderer.autoClear),
      })

      drawFrames()

      expect(clearedDuringOverlay).toBe(false)
      expect(engine.gl?.autoClear).toBe(true)
    })

    /** Otherwise every later frame smears over the last one, for good. */
    it('puts clearing back even when the overlay throws', () => {
      const engine = mounted({
        controls: 'none',
        onOverlay: () => {
          throw new Error('overlay')
        },
      })

      expect(() => drawFrames()).toThrow('overlay')
      expect(engine.gl?.autoClear).toBe(true)
    })

    /**
     * `begin` early-returns while a query is open, so a frame that threw between `begin` and
     * `end` leaves its own query open — and the next frame closes it instead of one of its own,
     * timing two frames as if they were one.
     */
    it('closes the timer query of a frame whose overlay throws', () => {
      const engine = mounted({
        controls: 'none',
        onOverlay: () => {
          throw new Error('overlay')
        },
      })
      engine.wantsGpuTiming()

      expect(() => drawFrames()).toThrow('overlay')

      expect(queryBegun).toHaveBeenCalledTimes(1)
      expect(queryEnded).toHaveBeenCalledTimes(1)
    })

    /** A query is a synchronous round trip to the driver, paid by every viewport that mounts one. */
    it('times no frame while nobody is reading the figure', () => {
      const engine = mounted({ controls: 'none' })

      drawFrames()

      expect(queryBegun).not.toHaveBeenCalled()
      expect(engine.stats.gpuFrameMs).toBeNull()
    })

    it('stops timing once the frames one read armed have been drawn', () => {
      const engine = mounted({ controls: 'none', onFrame: () => true })
      engine.wantsGpuTiming()

      for (let frame = 0; frame <= GPU_TIMED_FRAMES; frame += 1) drawFrames()

      expect(queryBegun).toHaveBeenCalledTimes(GPU_TIMED_FRAMES)
    })
  })

  describe('following its host', () => {
    /**
     * `setSize` blanks the drawing buffer, and an observation lands after the frame callbacks of
     * the paint that follows: a frame merely asked for here is one paint late, and every paint
     * of a dragged splitter shows an empty viewport.
     */
    it('draws the new size in the turn it is measured, not on the next frame', () => {
      atRest({ controls: 'none', onFrame: () => false })
      rendered.mockClear()

      observeResize()

      expect(rendered).toHaveBeenCalled()
      expect(frames.size).toBe(0)
    })

    /** The frame the motion had already asked for is the one drawn, rather than a second one. */
    it('draws once and keeps the loop when the resize lands mid-motion', () => {
      atRest({ controls: 'none', onFrame: () => true })
      rendered.mockClear()

      observeResize()

      expect(rendered).toHaveBeenCalledTimes(1)
      expect(frames.size).toBe(1)
    })

    /** A panel folded to nothing: the surface is refused, so the frame stays owed to its paint. */
    it('spends no frame on an observation it turns back', () => {
      const engine = atRest({ controls: 'none', onFrame: () => true })
      const canvas = engine.canvas
      if (!canvas) throw new Error('mounted with no canvas')
      Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 0 })
      rendered.mockClear()

      observeResize()

      expect(rendered).not.toHaveBeenCalled()
      expect(frames.size).toBe(1)
    })
  })

  describe('the gpu counters', () => {
    it('reports nothing until a frame has actually been drawn', () => {
      expect(mounted({ controls: 'none' }).stats).toMatchObject({ calls: 0, frames: 0 })
    })

    it('counts the overlay pass into the frame instead of being reset by it', () => {
      const engine = mounted({
        controls: 'none',
        onOverlay: renderer => renderer.render(engine.scene, engine.camera),
      })

      drawFrames()

      expect(rendered).toHaveBeenCalledTimes(2)
      expect(engine.stats.calls).toBe(2)
    })

    /**
     * Turning `autoReset` off hands the clearing to the engine: skip it and the counters add up
     * across frames, so a viewport left orbiting would report a cost that only ever climbs.
     */
    it('reports one frame at a time rather than the sum of every frame drawn', () => {
      const engine = mounted({ controls: 'none', onFrame: () => true })
      const first = engine.stats

      drawFrames()
      drawFrames()
      drawFrames()

      expect(engine.stats).toMatchObject({ frames: 3, calls: 1 })
      expect(engine.stats).toBe(first)
    })

    /** What proves a viewport went back to sleep rather than burning frames unseen. */
    it('stops counting once nothing moves', () => {
      const engine = mounted({ controls: 'none', onFrame: () => false })

      drawFrames()
      drawFrames()

      expect(engine.stats.frames).toBe(1)
    })
  })

  describe('the field of view', () => {
    it('takes the new angle and redraws', () => {
      const engine = atRest({ controls: 'none' })

      engine.setFieldOfView(90)

      expect(engine.perspective.fov).toBe(90)
      expect(frames.size).toBe(1)
    })

    it('redraws nothing when the angle does not change', () => {
      const engine = atRest({ fieldOfView: 60, controls: 'none' })

      engine.setFieldOfView(60)

      expect(frames.size).toBe(0)
    })
  })

  it('takes a background colour, and gives it back when asked for none', () => {
    const engine = mounted()

    engine.setBackgroundColor('#191a1c')
    expect(engine.scene.background).not.toBeNull()

    engine.setBackgroundColor('')
    expect(engine.scene.background).toBeNull()
  })

  describe('going away', () => {
    /**
     * Left behind, the next mount stacks a second canvas on top of it and the host grows a dead
     * one per remount.
     */
    it('takes its canvas with it', () => {
      const engine = mounted()

      engine.dispose()

      expect(host.querySelector('canvas')).toBeNull()
      expect(contextLost).toHaveBeenCalled()
      expect(disposed).toHaveBeenCalled()
    })

    it('drops the frame it had asked for', () => {
      const engine = atRest({ controls: 'none' })
      rendered.mockClear()
      engine.requestRender()

      engine.dispose()

      // Cancelled, not merely made harmless: a callback left queued keeps the whole engine
      // alive until it runs, and `renderFrame` bailing out would hide that.
      expect(frames.size).toBe(0)
      drawFrames()
      expect(rendered).not.toHaveBeenCalled()
    })

    it('disposes cleanly when it was never mounted', () => {
      expect(() => new ViewportEngine().dispose()).not.toThrow()
    })
  })
})
