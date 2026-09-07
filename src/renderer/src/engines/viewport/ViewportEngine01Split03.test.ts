import { OrthographicCamera, PerspectiveCamera } from 'three'
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

  describe('the quad layout', () => {
    const pointerAt = (x: number, y: number): PointerEvent =>
      new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })

    it('sizes the main camera to its quarter rather than to the canvas', () => {
      const engine = mounted()

      engine.setLayout('quad')
      // Same ratio here, since both halves are halved — what changes is which rectangle it reads.
      expect(engine.perspective.aspect).toBe(HOST_WIDTH / HOST_HEIGHT)
      expect(engine.paneAtPointer(pointerAt(10, 10))).toBe(0)
    })

    it('hands the drag to the pane under the pointer, and to it alone', () => {
      const engine = mounted()
      engine.setLayout('quad')
      const canvas = engine.canvas
      if (!canvas) throw new Error('mounted with no canvas')

      canvas.dispatchEvent(pointerAt(HOST_WIDTH - 10, 10))

      expect(engine.paneOrbits.map(orbit => orbit?.enabled)).toEqual([false, true, false, false])
    })

    it('says the pane is armed before the canvas hears the event, and says it while frozen', () => {
      const armed: number[] = []
      const engine = mounted({ onPaneArmed: () => armed.push(engine.activePane) })
      engine.setLayout('quad')
      const canvas = engine.canvas
      if (!canvas) throw new Error('mounted with no canvas')

      const afterCanvas: number[] = []
      canvas.addEventListener('pointermove', () => afterCanvas.push(armed.length))
      canvas.dispatchEvent(pointerAt(HOST_WIDTH - 10, HOST_HEIGHT - 10))

      expect(armed).toEqual([3])
      expect(afterCanvas).toEqual([1])

      // Frozen, nothing is armed — but the caller still has to be told, since thawing happens
      // from that very call. Without it a freeze that outlived its gesture would never lift.
      engine.freezePanes(true)
      canvas.dispatchEvent(pointerAt(10, 10))

      expect(engine.activePane).toBe(3)
      expect(armed).toHaveLength(2)
    })

    it('arms nothing while another gesture holds the pointer, and gives it back after', () => {
      const engine = mounted()
      engine.setLayout('quad')
      const canvas = engine.canvas
      if (!canvas) throw new Error('mounted with no canvas')

      canvas.dispatchEvent(pointerAt(10, 10))
      engine.freezePanes(true)
      canvas.dispatchEvent(pointerAt(HOST_WIDTH - 10, HOST_HEIGHT - 10))

      expect(engine.paneOrbits.map(orbit => orbit?.enabled)).toEqual([false, false, false, false])
      expect(engine.activePane).toBe(0)

      engine.freezePanes(false)

      // The pane the pointer STANDS in, not the one it was in when the gesture began: the move
      // that lifts a freeze is the one this returned early on, so reading the pane held before
      // would leave the working view — and the camera a gizmo grabs from — one event behind.
      expect(engine.activePane).toBe(3)
      expect(engine.paneOrbits.map(orbit => orbit?.enabled)).toEqual([false, false, false, true])
    })

    it('keeps the pane it had when thawing with the pointer off the canvas', () => {
      const engine = mounted()
      engine.setLayout('quad')
      const canvas = engine.canvas
      if (!canvas) throw new Error('mounted with no canvas')

      canvas.dispatchEvent(pointerAt(HOST_WIDTH - 10, HOST_HEIGHT - 10))
      engine.freezePanes(true)
      canvas.dispatchEvent(pointerAt(-40, -40))
      engine.freezePanes(false)

      expect(engine.activePane).toBe(3)
    })

    it('leaves a camera written by hand where it was put, once the orbits are frozen', () => {
      const engine = atRest()
      const orbit = engine.orbit
      if (!orbit) throw new Error('mounted with no orbit')

      orbit.autoRotate = true
      orbit.target.set(0, 0, 0)
      engine.camera.position.set(3, 4, 5)
      engine.freezePanes(true)
      engine.requestRender()
      drawFrames()

      expect(engine.camera.position.toArray()).toEqual([3, 4, 5])
    })

    it('leaves the one view armed however the pointer moves over it', () => {
      const engine = mounted()
      const canvas = engine.canvas
      if (!canvas) throw new Error('mounted with no canvas')
      engine.camera.position.set(0, 0, 10)

      canvas.dispatchEvent(pointerAt(10, 10))
      host.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 320,
          clientY: 400,
          altKey: true,
          bubbles: true,
        }),
      )
      host.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 420, clientY: 400, buttons: 1, bubbles: true }),
      )

      expect(engine.camera.position.x).not.toBeCloseTo(0, 3)
    })

    it('reads a pointer against its own pane, not against the canvas', () => {
      const engine = mounted()
      engine.setLayout('quad')

      // Dead centre of the bottom-right pane: its own centre, whatever the canvas thinks.
      const ndc = engine.pointerNdcOf(pointerAt(HOST_WIDTH * 0.75, HOST_HEIGHT * 0.75))

      expect(ndc?.x).toBeCloseTo(0)
      expect(ndc?.y).toBeCloseTo(0)
    })

    it('gives the active pane bottom-left, and none of it while there is one view', () => {
      const engine = mounted()
      const canvas = engine.canvas
      if (!canvas) throw new Error('mounted with no canvas')

      expect(engine.activePaneRegion()).toBeNull()

      engine.setLayout('quad')
      canvas.dispatchEvent(pointerAt(HOST_WIDTH - 10, HOST_HEIGHT - 10))

      // The bottom-right pane, which is where a bottom-left origin puts its own zero.
      expect(engine.activePaneRegion()).toEqual({
        x: HOST_WIDTH / 2,
        y: 0,
        width: HOST_WIDTH / 2,
        height: HOST_HEIGHT / 2,
      })
    })

    it('says which pane is about to be drawn, before drawing it', () => {
      const dressed: number[] = []
      const engine = atRest({
        onPane: index => {
          dressed.push(index)
          return false
        },
      })

      engine.setLayout('quad')
      dressed.length = 0
      drawFrames()

      expect(dressed).toEqual([0, 1, 2, 3])
    })

    it('announces the one pane of a single layout too', () => {
      const dressed: number[] = []
      const engine = atRest({
        onPane: index => {
          dressed.push(index)
          return false
        },
      })

      dressed.length = 0
      engine.requestRender()
      drawFrames()

      expect(dressed).toEqual([0])
    })

    it('takes the active pane back to the first when the layout closes', () => {
      const engine = mounted()
      engine.setLayout('quad')
      const canvas = engine.canvas
      if (!canvas) throw new Error('mounted with no canvas')

      canvas.dispatchEvent(pointerAt(HOST_WIDTH - 10, HOST_HEIGHT - 10))
      expect(engine.activePane).toBe(3)

      engine.setLayout('single')
      expect(engine.activePane).toBe(0)
    })

    it('adds views without orbits to a viewport that has none', () => {
      const engine = mounted({ controls: 'none' })

      engine.setLayout('quad')

      expect(engine.paneCameras).toHaveLength(4)
      expect(engine.paneOrbits).toEqual([null, null, null, null])
    })

    it('leaves the orbits alone when the pointer is off the surface', () => {
      const engine = mounted()
      engine.setLayout('quad')
      const canvas = engine.canvas
      if (!canvas) throw new Error('mounted with no canvas')

      canvas.dispatchEvent(pointerAt(10, 10))
      canvas.dispatchEvent(pointerAt(HOST_WIDTH + 50, 10))

      // Off the surface arms nobody, and the pane last used keeps the drag it was given.
      expect(engine.paneOrbits.map(orbit => orbit?.enabled)).toEqual([false, false, false, false])
      expect(engine.activePane).toBe(0)
    })

    it('asks for four views before it is mounted without building anything', () => {
      const engine = new ViewportEngine()
      engines.push(engine)

      engine.setLayout('quad')

      // Four cameras, no orbit: an orbit needs the canvas the mount has not made yet.
      expect(engine.paneCameras).toHaveLength(4)
      expect(engine.paneOrbits.slice(1)).toEqual([null, null, null])
      expect(engine.paneAtPointer(pointerAt(0, 0))).toBeNull()
      expect(engine.pointerNdcOf(pointerAt(0, 0))).toBeNull()
    })

    it('asks for the layout it already has without rebuilding anything', () => {
      const engine = mounted()
      engine.setLayout('quad')
      const first = engine.paneCameras[1]

      engine.setLayout('quad')

      expect(engine.paneCameras[1]).toBe(first)
    })

    it('gives every added orbit back when it goes away', () => {
      const engine = mounted()
      engine.setLayout('quad')
      const orbits = engine.paneOrbits.slice(1)

      engine.dispose()

      // Disposed controls answer no gesture; what this guards is that they were disposed at all.
      expect(orbits.every(orbit => orbit !== null)).toBe(true)
      expect(engine.paneCameras).toHaveLength(1)
    })

    it('takes the height its scene needs, and refuses a height of nothing', () => {
      const engine = mounted()
      engine.setLayout('quad')
      const side = engine.paneCameras[1]
      if (!(side instanceof OrthographicCamera)) throw new Error('the added views are flat')

      engine.setPaneHeight(40)
      expect(side.top).toBe(20)

      // Nothing, and the same value again, both leave the frustum where it is.
      engine.setPaneHeight(0)
      engine.setPaneHeight(40)
      expect(side.top).toBe(20)
    })

    it('swaps a pane between the two projections, keeping its placement', () => {
      const engine = mounted()
      engine.setLayout('quad')
      const flat = engine.paneCameras[1]
      if (!(flat instanceof OrthographicCamera)) throw new Error('an added view starts flat')
      flat.position.set(1, 2, 3)

      engine.setPaneProjection(1, 'perspective')

      const deep = engine.paneCameras[1]
      expect(deep).toBeInstanceOf(PerspectiveCamera)
      expect(deep?.position.toArray()).toEqual([1, 2, 3])
      // The orbit follows, or it would turn a camera nothing draws.
      expect(engine.paneOrbits[1]?.object).toBe(deep)
    })

    it('leaves a pane alone when it already draws through that projection', () => {
      const engine = mounted()
      engine.setLayout('quad')
      const first = engine.paneCameras[1]

      engine.setPaneProjection(1, 'orthographic')

      expect(engine.paneCameras[1]).toBe(first)
    })

    it('sends the main pane through the projection swap that owns the gizmo', () => {
      const engine = mounted()
      engine.setLayout('quad')

      engine.setPaneProjection(0, 'orthographic')

      expect(engine.paneCameras[0]).toBe(engine.orthographic)
    })

    it('has no projection to swap on a pane that does not exist', () => {
      const engine = mounted()

      // No quad layout, so pane 2 is nobody: the call stands rather than throwing.
      engine.setPaneProjection(2, 'perspective')

      expect(engine.paneCameras).toHaveLength(1)
    })
  })
})
