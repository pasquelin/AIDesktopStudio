import { PerspectiveCamera, Scene, type WebGLRenderTarget } from 'three'
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
import type { DrawRequest } from './viewportEngineTest-fixtures'
import {
  rendered,
  renderTarget,
  resetShadowDraws,
  setDisplayRatio,
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

  describe('drawing into a target', () => {
    // Only `isRenderTarget` is read here, and by the stand-in alone: building a real one asks
    // jsdom for a WebGL context, which is the very thing this suite stands in for.
    const target = { isRenderTarget: true, width: 64, height: 48 } as unknown as WebGLRenderTarget

    const request = (onto: WebGLRenderTarget | null): DrawRequest => ({
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      surface: 'offscreen',
      paneIndex: 0,
      cameraNodeId: null,
      target: onto,
      rect: null,
      width: 64,
      height: 48,
    })

    it('binds the target before it renders', () => {
      const engine = atRest()
      renderTarget.mockClear()
      rendered.mockClear()

      expect(engine.drawScene(request(target))).toBe(false)

      expect(renderTarget).toHaveBeenLastCalledWith(target)
      expect(rendered).toHaveBeenCalledTimes(1)
    })

    // And it binds it for whoever ELSE draws, not only for its own fallback: the composer is
    // handed the request after the target is bound, so a chain drawing into it cannot miss.
    it('binds the target before handing the request over', () => {
      const seen: (WebGLRenderTarget | null)[] = []
      const engine = atRest({
        onDraw: () => {
          seen.push(renderTarget.mock.calls.at(-1)?.[0] ?? null)
          return true
        },
      })
      renderTarget.mockClear()
      rendered.mockClear()

      expect(engine.drawScene(request(target))).toBe(true)

      expect(seen.at(-1)).toBe(target)
      // It said it drew, so the viewport must not draw a second time over it.
      expect(rendered).not.toHaveBeenCalled()
    })

    it('points back at the canvas for a request that names none', () => {
      const engine = atRest()
      renderTarget.mockClear()

      engine.drawScene(request(null))

      expect(renderTarget).toHaveBeenLastCalledWith(null)
    })
  })
})
