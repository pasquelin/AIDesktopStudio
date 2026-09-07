import { ACESFilmicToneMapping, NoToneMapping } from 'three'
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
  sized,
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

  describe('mounting', () => {
    /** React must never own the canvas — see the engine invariants in CLAUDE.md. */
    it('makes its own canvas inside the host', () => {
      mounted()

      expect(host.querySelector('canvas')).not.toBeNull()
    })

    it('draws flat by default, and filmic when asked', () => {
      expect(mounted().gl?.toneMapping).toBe(NoToneMapping)
      expect(mounted({ toneMapping: true }).gl?.toneMapping).toBe(ACESFilmicToneMapping)
    })

    it('leaves shadow maps off unless a viewport asks for them', () => {
      expect(mounted().gl?.shadowMap.enabled).toBe(false)
      expect(mounted({ shadows: true }).gl?.shadowMap.enabled).toBe(true)
    })

    it('gives no orbit to a viewport that only looks around', () => {
      expect(mounted({ controls: 'none' }).orbit).toBeNull()
    })

    it('orbits by default', () => {
      expect(mounted().orbit).not.toBeNull()
    })

    it('sizes itself and its camera to the host', () => {
      const engine = mounted()

      expect(sized).toHaveBeenCalledWith(HOST_WIDTH, HOST_HEIGHT, false)
      expect(engine.perspective.aspect).toBe(HOST_WIDTH / HOST_HEIGHT)
    })
  })
})
