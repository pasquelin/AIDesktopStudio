import { SCHEME_OF } from '@shared/domain/navigationPreset'
import { Vector3 as ThreeVector3 } from 'three'
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

    it('turns the camera on alt and the left button, keeping its distance to the pivot', () => {
      const engine = backedOff()

      host.dispatchEvent(press({ altKey: true }))
      host.dispatchEvent(dragTo(420, 400))

      expect(engine.camera.position.x).not.toBeCloseTo(0, 3)
      expect(engine.camera.position.length()).toBeCloseTo(10, 6)
    })

    it('slides the camera and its pivot together on the middle button', () => {
      const engine = backedOff()
      const pivot = engine.orbit?.target.clone()

      host.dispatchEvent(press({ button: 1 }))
      host.dispatchEvent(dragTo(420, 400, 4))

      expect(engine.camera.position.x).toBeLessThan(0)
      expect(engine.orbit?.target.x).toBeCloseTo(engine.camera.position.x, 6)
      expect(pivot?.x).toBe(0)
    })

    it('closes the camera in on its pivot on alt and the right button', () => {
      const engine = backedOff()

      host.dispatchEvent(press({ button: 2, altKey: true }))
      host.dispatchEvent(dragTo(420, 400, 2))

      expect(engine.camera.position.length()).toBeLessThan(10)
      // The pivot stays where it was: a dolly closes IN on it, where a pan carries it along.
      expect(engine.orbit?.target.length()).toBeCloseTo(0, 6)
    })

    it('pulls it back out the other way', () => {
      const engine = backedOff()

      host.dispatchEvent(press({ button: 2, altKey: true }))
      host.dispatchEvent(dragTo(220, 400, 2))

      expect(engine.camera.position.length()).toBeGreaterThan(10)
    })

    it('swallows no press at all, whatever names the gesture', () => {
      const heard = vi.fn()
      host.addEventListener('pointerdown', heard)
      backedOff()

      host.dispatchEvent(press())
      host.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }))
      host.dispatchEvent(press({ altKey: true }))
      host.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }))
      host.dispatchEvent(press({ button: 1 }))

      expect(heard).toHaveBeenCalledTimes(3)
    })

    it('ends a two-button chord when the button that named it is let go', () => {
      const engine = backedOff({
        scheme: () => ({ ...SCHEME_OF.unreal, pan: [{ button: 2, held: 0 }] }),
      })

      host.dispatchEvent(press({ button: 0, buttons: 1 }))
      host.dispatchEvent(press({ button: 2, buttons: 3 }))
      host.dispatchEvent(dragTo(420, 400, 3))
      const panned = engine.orbit?.target.clone()
      // The right button up, the left still down — and the pan is over.
      host.dispatchEvent(new PointerEvent('pointerup', { button: 2, buttons: 1, bubbles: true }))
      host.dispatchEvent(dragTo(200, 400, 1))

      expect(panned?.x).not.toBeCloseTo(0, 3)
      expect(engine.orbit?.target.x).toBeCloseTo(panned?.x ?? 0, 6)
    })

    it('takes a dolly chord pressed onto the button already orbiting', () => {
      const engine = backedOff({
        scheme: () => ({
          ...SCHEME_OF.studio,
          orbit: [{ button: 0 }],
          dolly: [{ button: 2, held: 0 }],
        }),
      })
      const reach = engine.camera.position.length()

      host.dispatchEvent(press({ button: 0, buttons: 1 }))
      host.dispatchEvent(dragTo(340, 400, 1))
      const orbited = engine.camera.position.length()
      host.dispatchEvent(press({ button: 2, buttons: 3 }))
      host.dispatchEvent(dragTo(340, 300, 3))

      expect(orbited).toBeCloseTo(reach, 6)
      expect(engine.camera.position.length()).not.toBeCloseTo(reach, 3)
    })

    describe('with fingers', () => {
      const finger = (type: string, id: number, x: number, y: number): PointerEvent =>
        new PointerEvent(type, {
          pointerId: id,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
          buttons: type === 'pointerup' ? 0 : 1,
          bubbles: true,
        })

      const twoDown = (engine: ViewportEngine): ViewportEngine => {
        host.dispatchEvent(finger('pointerdown', 1, 300, 400))
        host.dispatchEvent(finger('pointerdown', 2, 340, 400))
        return engine
      }

      it('turns the view on one finger, which no mouse scheme spells', () => {
        const engine = backedOff()

        host.dispatchEvent(finger('pointerdown', 1, 320, 400))
        window.dispatchEvent(finger('pointermove', 1, 420, 400))

        expect(engine.camera.position.x).not.toBeCloseTo(0, 3)
        expect(engine.camera.position.length()).toBeCloseTo(10, 6)
      })

      it('closes in as two fingers spread, and pulls back as they close', () => {
        const engine = twoDown(backedOff())

        window.dispatchEvent(finger('pointermove', 2, 460, 400))
        const closed = engine.camera.position.length()
        window.dispatchEvent(finger('pointermove', 2, 340, 400))

        expect(closed).toBeLessThan(10)
        expect(engine.camera.position.length()).toBeGreaterThan(closed)
      })

      it('slides the view and its pivot together as the pair travels', () => {
        const engine = twoDown(backedOff())

        // Both fingers the same way: the gap holds, so nothing but the middle moved.
        window.dispatchEvent(finger('pointermove', 1, 400, 400))
        window.dispatchEvent(finger('pointermove', 2, 440, 400))

        expect(engine.camera.position.x).toBeLessThan(0)
        expect(engine.orbit?.target.x).toBeCloseTo(engine.camera.position.x, 6)
      })

      /** Resumed from where the pair began, the view would jump the whole way they travelled. */
      it('hands the view back to the finger still down, anchored where it now is', () => {
        const engine = twoDown(backedOff())

        window.dispatchEvent(finger('pointermove', 1, 500, 400))
        host.dispatchEvent(finger('pointerup', 2, 340, 400))
        const settled = engine.camera.position.clone()
        window.dispatchEvent(finger('pointermove', 1, 502, 400))

        expect(engine.camera.position.distanceTo(settled)).toBeLessThan(1)
      })

      /**
       * 🛑 Read as « one finger left », a third finger lifted killed the pinch and armed a turn:
       * two fingers were still on the glass, and pan and zoom stayed dead until every one left.
       */
      it('keeps the pair when a third finger lifts and two are still down', () => {
        const engine = backedOff()
        host.dispatchEvent(finger('pointerdown', 1, 300, 400))
        host.dispatchEvent(finger('pointerdown', 2, 340, 400))
        host.dispatchEvent(finger('pointerdown', 3, 380, 400))

        host.dispatchEvent(finger('pointerup', 3, 380, 400))
        const settled = engine.camera.position.length()
        // The two still down spread: a pair, so it closes in rather than turning.
        window.dispatchEvent(finger('pointermove', 2, 460, 400))

        expect(engine.camera.position.length()).toBeLessThan(settled)
      })

      /** A finger the browser takes back sends this and never a `pointerup`. */
      it('lets the pair go on a cancelled finger, the survivor turning rather than sliding', () => {
        const engine = twoDown(backedOff())

        window.dispatchEvent(finger('pointercancel', 2, 340, 400))
        window.dispatchEvent(finger('pointermove', 1, 400, 400))

        // A turn keeps its distance where a pinch spends it, and carries no pivot where a pan does.
        expect(engine.camera.position.length()).toBeCloseTo(10, 6)
        expect(engine.orbit?.target.length()).toBeCloseTo(0, 6)
      })
    })

    it('lets go the moment the panes freeze, a handle having taken the pointer', () => {
      const engine = backedOff()

      host.dispatchEvent(press({ altKey: true }))
      engine.freezePanes(true)
      const stood = engine.camera.position.clone()
      host.dispatchEvent(dragTo(500, 500))

      expect(engine.camera.position.distanceTo(stood)).toBeCloseTo(0, 6)
    })

    it('refuses a ground further than the view already reaches, and takes one nearer', () => {
      const engine = backedOff({ pivotMode: () => ({ aroundSelection: false, underCursor: true }) })
      // A move, never a press alone: the pivot is decided at the first pixel travelled, once the
      // gizmo has demonstrably NOT taken the press — see `onNavigate`.
      const aim = (at: [number, number, number], pivot: [number, number, number]) => {
        engine.camera.lookAt(...at)
        engine.orbit?.target.set(...pivot)
        host.dispatchEvent(press({ altKey: true }))
        window.dispatchEvent(dragTo(321, 400))
        host.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }))
      }

      // A hair under the horizon from two metres up: the plane is met some two kilometres out.
      engine.camera.position.set(0, 2, 10)
      aim([0, 1.9, -100], [0, 2, 0])
      expect(engine.orbit?.target.toArray()).toEqual([0, 2, 0])

      // Down onto the origin from ten metres — off the vertical, which `lookAt` treats as
      // degenerate. The plane is met within reach, and the pivot LANDS on it, a distance apart
      // from where it would have stayed.
      engine.camera.position.set(0, 10, 1)
      aim([0, 0, 0], [5, 0, 5])
      expect(engine.orbit?.target.x).toBeCloseTo(0, 6)
      expect(engine.orbit?.target.y).toBeCloseTo(0, 6)
      expect(engine.orbit?.target.z).toBeCloseTo(0, 6)
    })

    it('turns around the selection when the preference asks, wherever the pointer is', () => {
      const engine = backedOff({
        selectionCentre: () => new ThreeVector3(0, 0, 4),
        pivotMode: () => ({ aroundSelection: true, underCursor: false }),
      })

      host.dispatchEvent(press({ altKey: true }))
      window.dispatchEvent(dragTo(321, 400))

      expect(engine.orbit?.target.z).toBeCloseTo(4, 6)
    })

    it('ignores a selection that sits off screen, which is what yanks the view in Unreal', () => {
      const engine = backedOff({
        selectionCentre: () => new ThreeVector3(0, 0, 400),
        pivotMode: () => ({ aroundSelection: true, underCursor: false }),
      })

      host.dispatchEvent(press({ altKey: true }))
      window.dispatchEvent(dragTo(321, 400))

      expect(engine.orbit?.target.z).toBe(0)
    })

    it('publishes the framing once the hand lets go, and never for a press that never moved', () => {
      const settled = vi.fn()
      backedOff({ onCameraSettled: settled })

      host.dispatchEvent(press({ altKey: true }))
      host.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }))
      expect(settled).not.toHaveBeenCalled()

      host.dispatchEvent(press({ altKey: true }))
      host.dispatchEvent(dragTo(420, 460))
      host.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }))
      expect(settled).toHaveBeenCalledWith(0)
    })

    it('takes the gestures from `OrbitControls` on perspective, and gives them back on ortho', () => {
      const engine = backedOff()
      expect(engine.orbit?.enabled).toBe(false)

      engine.setProjection('orthographic')
      expect(engine.orbit?.enabled).toBe(true)

      engine.setProjection('perspective')
      expect(engine.orbit?.enabled).toBe(false)
    })

    it('takes no pointer capture, the gizmo grabbing the same canvas', () => {
      const engine = backedOff()
      const canvas = engine.canvas
      if (!canvas) throw new Error('mounted with no canvas')
      const captured = vi.fn()
      canvas.setPointerCapture = captured

      host.dispatchEvent(press({ altKey: true }))

      expect(captured).not.toHaveBeenCalled()
    })

    it('goes on turning once the pointer has strayed off the panel', () => {
      const engine = backedOff()

      host.dispatchEvent(press({ altKey: true }))
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 2000, clientY: 400, buttons: 1 }),
      )

      expect(engine.camera.position.x).not.toBeCloseTo(0, 3)
    })

    it('rests the pivot ahead when a flick carries the camera past what it aimed at', () => {
      const engine = backedOff()
      engine.orbit?.target.set(0, 0, 9.9)

      host.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -500,
          clientX: 320,
          clientY: 400,
          bubbles: true,
          cancelable: true,
        }),
      )

      const pivot = engine.orbit?.target
      if (!pivot) throw new Error('mounted with no orbit')
      expect(pivot.clone().sub(engine.camera.position).z).toBeLessThan(0)
    })

    it('forgets a settled wheel aim so the next gesture raycasts from its own pointer', () => {
      const engine = backedOff()

      host.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -100,
          clientX: 320,
          clientY: 400,
          bubbles: true,
          cancelable: true,
        }),
      )

      const target = engine['navigationTarget']
      expect(target['wheelAim']).not.toBeNull()
      vi.advanceTimersByTime(250)
      expect(target['wheelAim']).toBeNull()
    })
  })
})
