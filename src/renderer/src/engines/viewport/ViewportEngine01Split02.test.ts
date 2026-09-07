import { Color, OrthographicCamera, PerspectiveCamera } from 'three'
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
  clearColor,
  HOST_HEIGHT,
  HOST_WIDTH,
  INSET_CADENCE_MS,
  rendered,
  renderTarget,
  resetShadowDraws,
  scissored,
  scissorTest,
  setDisplayRatio,
  viewported,
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

    const insetPane = (over: Partial<Parameters<ViewportEngine['setInsetPane']>[0]> = {}) => ({
      camera: new PerspectiveCamera(),
      cameraNodeId: null,
      backdrop: new Color(),
      rect: { x: 500, y: 700, width: 100, height: 56 },
      full: false,
      ...over,
    })

    it('starts as one view over the whole surface', () => {
      const engine = mounted()

      expect(engine.paneLayout).toBe('single')
      expect(engine.paneCameras).toHaveLength(1)
    })

    it('adds three orthographic views, and takes them away again', () => {
      const engine = mounted()

      engine.setLayout('quad')
      expect(engine.paneCameras).toHaveLength(4)
      // The main one keeps its projection; the three added are side views, never perspective.
      const added = engine.paneCameras.slice(1)
      expect(added.every(camera => camera instanceof OrthographicCamera)).toBe(true)

      engine.setLayout('single')
      expect(engine.paneCameras).toHaveLength(1)
    })

    it('draws four scissored passes into the one canvas', () => {
      const engine = atRest()
      rendered.mockClear()
      viewported.mockClear()

      engine.setLayout('quad')
      drawFrames()

      expect(rendered).toHaveBeenCalledTimes(4)
      expect(scissorTest).toHaveBeenLastCalledWith(false)
      // Bottom-left quarter, in WebGL's own frame: origin at the bottom, so the top-left pane
      // sits at half the height and the bottom row at zero.
      expect(viewported).toHaveBeenCalledWith(0, HOST_HEIGHT / 2, HOST_WIDTH / 2, HOST_HEIGHT / 2)
      expect(scissored).toHaveBeenCalledWith(HOST_WIDTH / 2, 0, HOST_WIDTH / 2, HOST_HEIGHT / 2)
    })

    it('places its panes in CSS pixels, whatever the display is worth', () => {
      setDisplayRatio(2)
      const engine = atRest()
      viewported.mockClear()

      engine.setLayout('quad')
      drawFrames()

      // The same rectangles as at a ratio of 1: three applies the display's own scale after this.
      expect(viewported).toHaveBeenCalledWith(0, HOST_HEIGHT / 2, HOST_WIDTH / 2, HOST_HEIGHT / 2)
      expect(viewported).not.toHaveBeenCalledWith(0, HOST_HEIGHT, HOST_WIDTH, HOST_HEIGHT)
    })

    it('clears the preview to its own backdrop before drawing it', () => {
      const engine = atRest()
      clearColor.mockClear()

      const backdrop = new Color('#123456')
      engine.setInsetPane(insetPane({ backdrop }))
      drawFrames()

      expect(clearColor).toHaveBeenNthCalledWith(1, backdrop, 1)
      // Put back, and with the alpha it was read with: every later frame clears to what the
      // viewport itself uses, not to the preview's colour.
      expect(clearColor).toHaveBeenLastCalledWith(expect.any(Color), 1)
    })

    it('draws the camera preview into a target and composites it, never a second context', () => {
      const engine = atRest()
      rendered.mockClear()
      renderTarget.mockClear()

      engine.setInsetPane(insetPane())
      drawFrames()

      // The panes, the preview into its target, the quad that puts it on the canvas.
      expect(rendered).toHaveBeenCalledTimes(3)
      expect(renderTarget).toHaveBeenCalledWith(expect.objectContaining({ isRenderTarget: true }))
      expect(renderTarget).toHaveBeenLastCalledWith(null)
      // Bottom-right, in WebGL's own frame: the host is 800 tall, so a rect 700 down sits at 44.
      expect(scissored).toHaveBeenCalledWith(500, HOST_HEIGHT - 700 - 56, 100, 56)
      expect(scissorTest).toHaveBeenLastCalledWith(false)
    })

    it('composites the picture again rather than redrawing it while nothing it shows has moved', () => {
      const engine = atRest()
      engine.setInsetPane(insetPane())
      drawFrames()
      rendered.mockClear()

      engine.requestRender()
      drawFrames()

      // The panes and the quad. The preview itself is not drawn again.
      expect(rendered).toHaveBeenCalledTimes(2)
    })

    it('draws it again once what it shows has changed', () => {
      const engine = atRest()
      engine.setInsetPane(insetPane())
      drawFrames()
      rendered.mockClear()

      engine.invalidateInset()
      // Past the cap, so the change is not the one being held back — see the test below.
      vi.advanceTimersByTime(100)
      engine.requestRender()
      drawFrames()

      expect(rendered).toHaveBeenCalledTimes(3)
    })

    it('holds the preview to its own cadence while what it shows keeps changing', () => {
      const engine = atRest()
      engine.setInsetPane(insetPane())
      drawFrames()
      rendered.mockClear()

      // Three frames of playback well inside one cadence window — the panes follow every one.
      for (let frame = 0; frame < 3; frame += 1) {
        engine.invalidateInset()
        vi.advanceTimersByTime(5)
        engine.requestRender()
        drawFrames()
      }

      // Three pane passes and three quads. The preview itself was not drawn once.
      expect(rendered).toHaveBeenCalledTimes(6)
    })

    it('draws into a resized target at once, whatever the cadence would have said', () => {
      const engine = atRest()
      engine.setInsetPane(insetPane())
      drawFrames()
      rendered.mockClear()

      // Inside the cadence window on purpose: this is the frame the cap would have held back.
      vi.advanceTimersByTime(5)
      engine.setInsetPane(insetPane({ rect: { x: 500, y: 700, width: 200, height: 112 } }))
      drawFrames()

      // The panes, the preview into its new target, the quad.
      expect(rendered).toHaveBeenCalledTimes(3)
    })

    it('wakes itself to catch up on a change the cadence held back', () => {
      const engine = atRest()
      engine.setInsetPane(insetPane())
      drawFrames()
      rendered.mockClear()

      engine.invalidateInset()
      vi.advanceTimersByTime(8)
      engine.requestRender()
      drawFrames()
      expect(rendered).toHaveBeenCalledTimes(2)

      // Nobody asks for anything more; the wake the engine set for itself is what draws it.
      vi.advanceTimersByTime(INSET_CADENCE_MS)
      drawFrames()
      expect(rendered).toHaveBeenCalledTimes(5)
    })

    it('skips the panes under a preview grown to the whole view', () => {
      const engine = atRest()
      rendered.mockClear()

      engine.setInsetPane(
        insetPane({
          full: true,
          rect: { x: 2, y: 2, width: HOST_WIDTH - 4, height: HOST_HEIGHT - 4 },
        }),
      )
      drawFrames()

      // The preview into its target, and the quad. No pane pass at all.
      expect(rendered).toHaveBeenCalledTimes(2)
      // The two pixels of canvas the DOM frame leaves outside the picture, which no pane covers
      // any more: cleared, or they would hold whatever the last frame that drew them left.
      expect(scissored).toHaveBeenCalledWith(0, 0, HOST_WIDTH, HOST_HEIGHT)
    })

    it('leaves the matrices of the frame alone, and puts the flag back', () => {
      const engine = atRest()

      const seen: boolean[] = []
      rendered.mockImplementation(() => seen.push(engine.scene.matrixWorldAutoUpdate))

      engine.setInsetPane(insetPane())
      drawFrames()

      // Panes, preview, quad — and only the preview is spared.
      expect(seen).toEqual([true, false, true])
      expect(engine.scene.matrixWorldAutoUpdate).toBe(true)
    })

    it('keeps them on for a grown preview, which has no pane pass to ride on', () => {
      const engine = atRest()
      const renderer = engine.gl
      if (!renderer) throw new Error('the viewport mounts a renderer')

      const seen: boolean[] = []
      rendered.mockImplementation(() => seen.push(engine.scene.matrixWorldAutoUpdate))

      engine.setInsetPane(insetPane({ full: true }))
      drawFrames()

      expect(seen).toEqual([true, true])
    })

    it('hides the workshop for the preview pass and puts it back after', () => {
      const restore = vi.fn()
      const hide = vi.fn(() => restore)
      const engine = atRest({ onInset: hide })

      engine.setInsetPane(insetPane({ rect: { x: 0, y: 0, width: 100, height: 56 } }))
      drawFrames()

      expect(hide).toHaveBeenCalledTimes(1)
      expect(restore).toHaveBeenCalledTimes(1)
    })

    it('leaves the workshop alone on a frame that only composites', () => {
      const restore = vi.fn()
      const hide = vi.fn(() => restore)
      const engine = atRest({ onInset: hide })

      engine.setInsetPane(insetPane())
      drawFrames()
      hide.mockClear()

      engine.requestRender()
      drawFrames()

      expect(hide).not.toHaveBeenCalled()
    })

    it('answers no pane for a pointer inside the preview', () => {
      const engine = atRest()
      engine.setInsetPane(insetPane())

      expect(engine.paneAtPointer(pointerAt(550, 720))).toBeNull()
      expect(engine.paneAtPointer(pointerAt(100, 100))).toBe(0)
    })

    it('draws a locked pane through the camera it was lent, and gives it the orbit', () => {
      const engine = atRest()
      engine.setLayout('quad')
      const lent = new PerspectiveCamera()

      engine.setPaneCamera(1, lent)

      expect(engine.paneCameras[1]).toBe(lent)
      // The orbit follows, or a drag in that pane would turn a camera nobody is drawing.
      expect(engine.paneOrbits[1]?.object).toBe(lent)
    })

    it('leaves a borrowed camera aimed where it already was', () => {
      const engine = atRest()
      engine.setLayout('quad')

      const lent = new PerspectiveCamera()
      lent.position.set(0, 0, 10)
      lent.lookAt(0, 0, 0)
      const before = lent.quaternion.clone()

      engine.setPaneCamera(1, lent)
      engine.paneOrbits[1]?.update()

      expect(lent.quaternion.angleTo(before)).toBeCloseTo(0, 6)
    })

    it('sizes a borrowed camera to the pane it draws into', () => {
      const engine = atRest()
      engine.setLayout('quad')
      const lent = new PerspectiveCamera()

      engine.setPaneCamera(1, lent)

      // A camera of the scene is built square; the pane is a quarter of the host.
      expect(lent.aspect).toBeCloseTo(HOST_WIDTH / HOST_HEIGHT, 6)
    })

    it('gives a pane its own camera back when the loan ends', () => {
      const engine = atRest()
      engine.setLayout('quad')
      const own = engine.paneCameras[1]

      engine.setPaneCamera(1, new PerspectiveCamera())
      engine.setPaneCamera(1, null)

      expect(engine.paneCameras[1]).toBe(own)
    })

    it('says which pane a settled orbit belongs to', () => {
      const settled = vi.fn()
      const engine = atRest({ onCameraSettled: settled })
      engine.setLayout('quad')

      engine.orbit?.dispatchEvent({ type: 'end' })
      expect(settled).toHaveBeenLastCalledWith(0)

      engine.paneOrbits[1]?.dispatchEvent({ type: 'end' })
      expect(settled).toHaveBeenLastCalledWith(1)
    })

    it('draws one pass and no scissor while there is one view', () => {
      const engine = atRest()
      rendered.mockClear()
      scissorTest.mockClear()

      engine.requestRender()
      drawFrames()

      expect(rendered).toHaveBeenCalledTimes(1)
      expect(scissorTest).not.toHaveBeenCalled()
    })
  })
})
