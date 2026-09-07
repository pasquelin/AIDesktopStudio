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
  resetShadowDraws,
  setDisplayRatio,
  shadowDraws,
  ViewportEngine,
} from './viewportEngineTest-fixtures'

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

  describe('and the shadow maps it reuses', () => {
    const shadowed = (): ViewportEngine => atRest({ shadows: true })

    it('restores selectively held lights after the viewport frame', () => {
      const restore = vi.fn()
      const prepare = vi.fn(() => restore)
      const engine = atRest({ shadows: true, onShadowFrame: prepare })
      drawFrames()
      prepare.mockClear()
      restore.mockClear()

      engine.requestRender()
      drawFrames()

      expect(prepare).toHaveBeenCalledOnce()
      expect(prepare).toHaveBeenCalledWith(true)
      expect(restore).toHaveBeenCalledOnce()
    })

    it('marks a selective shadow frame without turning it into a full refresh', () => {
      const prepare = vi.fn(() => vi.fn())
      const engine = atRest({ shadows: true, onShadowFrame: prepare })
      drawFrames()
      prepare.mockClear()

      engine.requestShadowRender()
      drawFrames()

      expect(prepare).toHaveBeenCalledWith(false)
    })

    it('keeps a full refresh when it joins an already scheduled selective frame', () => {
      const prepare = vi.fn(() => vi.fn())
      const engine = atRest({ shadows: true, onShadowFrame: prepare })
      drawFrames()
      prepare.mockClear()

      engine.requestShadowRender()
      engine.requestRender()
      drawFrames()

      expect(prepare).toHaveBeenCalledWith(true)
    })

    it('draws them again on a frame anything but the camera asked for', () => {
      const engine = shadowed()
      shadowDraws.length = 0

      engine.requestRender()
      drawFrames()

      expect(shadowDraws).toContain(true)
    })

    it('reuses them on a frame the camera alone asked for', () => {
      const engine = shadowed()
      engine.requestRender()
      drawFrames()
      shadowDraws.length = 0

      engine.requestCameraRender()
      drawFrames()

      expect(shadowDraws).not.toContain(true)
    })

    it('draws them again for a pane that changed what the scene wears', () => {
      // A quad layout where one pane puts the scene's lights out for a material preview: its
      // maps are drawn from a scene the pane beside it is not showing.
      const engine = atRest({ shadows: true, onPane: index => index === 2 })
      engine.setLayout('quad')
      drawFrames()
      shadowDraws.length = 0

      engine.requestCameraRender()
      drawFrames()

      // The third pane alone, and not the three that wear what is already on.
      expect(shadowDraws).toEqual([false, false, true, false])
    })

    it('leaves them armed for whatever renders between two frames', () => {
      const engine = shadowed()
      const renderer = engine.gl
      if (!renderer) throw new Error('the viewport mounts a renderer')

      engine.requestCameraRender()
      drawFrames()

      // A film being written out, a capture, a scene clip: none comes through the frame loop and
      // none would know to ask. An exported video was reusing the maps of the pose Render was
      // pressed on, with an animated character moving over a shadow that stood still.
      expect(renderer.shadowMap.needsUpdate).toBe(true)
    })

    it('draws them again when something moves mid-orbit', () => {
      const engine = shadowed()
      engine.requestCameraRender()
      // Both in the same turn, and the camera one first: the frame is already asked for, so a
      // scene change that only scheduled would be drawn against the shadows of the last one.
      engine.requestRender()
      shadowDraws.length = 0
      drawFrames()

      expect(shadowDraws).toContain(true)
    })
  })
})
