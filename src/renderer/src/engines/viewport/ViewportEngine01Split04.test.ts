import { PerspectiveCamera } from 'three'
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
  HOST_HEIGHT,
  HOST_WIDTH,
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

  describe('the quad layout', () => {
    const pointerAt = (x: number, y: number): PointerEvent =>
      new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })

    it('swaps a projection on a viewport built without controls', () => {
      const engine = mounted({ controls: 'none' })
      engine.setLayout('quad')

      engine.setPaneProjection(1, 'perspective')

      expect(engine.paneCameras[1]).toBeInstanceOf(PerspectiveCamera)
    })

    it('sizes both cameras of an added view to its own quarter', () => {
      const engine = mounted()
      engine.setLayout('quad')

      engine.setPaneProjection(1, 'perspective')
      engine.setPaneHeight(20)
      const deep = engine.paneCameras[1]
      if (!(deep instanceof PerspectiveCamera)) throw new Error('the pane was set to perspective')

      // A quarter of the host, so the ratio is the host's — what matters is that it was set at
      // all: a perspective left at 1 stretches everything it draws.
      expect(deep.aspect).toBeCloseTo(HOST_WIDTH / HOST_HEIGHT)
    })

    it('answers no pane for a pointer off the surface', () => {
      const engine = mounted()
      engine.setLayout('quad')

      expect(engine.paneAtPointer(pointerAt(HOST_WIDTH + 5, 10))).toBeNull()
    })
  })
})
