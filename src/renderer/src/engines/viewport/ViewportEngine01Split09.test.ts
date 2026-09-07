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
import { resetShadowDraws, setDisplayRatio, ViewportEngine } from './viewportEngineTest-fixtures'

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

  describe('navigating the view', () => {
    const press = (over: PointerEventInit = {}): PointerEvent =>
      new PointerEvent('pointerdown', {
        clientX: 320,
        clientY: 400,
        button: 0,
        bubbles: true,
        ...over,
      })

    const dragTo = (x: number, y: number, buttons = 1): PointerEvent =>
      new PointerEvent('pointermove', { clientX: x, clientY: y, buttons, bubbles: true })

    const backedOff = (options?: ConstructorParameters<typeof ViewportEngine>[0]) => {
      const engine = atRest(options)
      engine.camera.position.set(0, 0, 10)
      engine.camera.quaternion.identity()
      return engine
    }

    it('lets a second pointer come and go without ending the one drag under way', () => {
      const engine = backedOff()

      host.dispatchEvent(press({ altKey: true }))
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }))
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 420, clientY: 400, buttons: 1 }),
      )

      expect(engine.camera.position.x).not.toBeCloseTo(0, 3)
    })

    it('leaves no drag behind for the next mount to resume', () => {
      const engine = backedOff()
      host.dispatchEvent(press({ altKey: true }))

      engine.dispose()
      engine.mount(host)
      engine.camera.position.set(0, 0, 10)
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 2000, clientY: 400, buttons: 1 }),
      )

      expect(engine.camera.position.x).toBeCloseTo(0, 6)
    })

    it('leaves an orthographic view to `OrbitControls`', () => {
      const engine = backedOff()
      engine.setProjection('orthographic')
      const stood = engine.camera.position.clone()

      host.dispatchEvent(press({ altKey: true }))
      host.dispatchEvent(dragTo(420, 400))

      expect(engine.camera.position.distanceTo(stood)).toBeCloseTo(0, 6)
    })
  })
})
