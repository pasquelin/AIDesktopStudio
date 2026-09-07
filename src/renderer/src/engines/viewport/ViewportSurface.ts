import { ACESFilmicToneMapping, Color, NoToneMapping, WebGLRenderer } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { DEFAULT_RENDER_POLICY } from '@shared/domain/renderPolicy'
import { applyShadowPolicy } from '../scene/shadows'
import { token } from '../core/palette'
import { createGpuTimer, isGpuTimerContext } from './gpuTimer'
import { ViewportMounting } from './ViewportMounting'

export abstract class ViewportSurface extends ViewportMounting {
  public abstract readonly requestCameraRender: () => void

  protected abstract readonly onNavigate: (event: PointerEvent) => void

  protected abstract readonly onNavigateRelease: (event: PointerEvent) => void

  protected abstract readonly onWheelCapture: (event: WheelEvent) => void

  protected abstract readonly onResize: () => boolean

  protected abstract drawPendingFrame(): void

  protected abstract disposeInset(): void

  public abstract readonly requestRender: () => void

  /** Makes its own canvas: React must never own it — see the engine invariants in CLAUDE.md. */
  mount(host: HTMLElement): void {
    const canvas = this.canvasIn(host)
    const renderer = this.rendererFor(canvas)
    this.renderer = renderer
    const context = renderer.getContext()
    this.gpuTimer = isGpuTimerContext(context) ? createGpuTimer(context) : null
    this.mountControls(canvas)
    this.mountNavigation(host)
    this.observeCanvas(canvas)
    this.armOrbits(this.armedPane)
    this.onResize()
  }

  private canvasIn(host: HTMLElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    host.appendChild(canvas)
    return canvas
  }

  private rendererFor(canvas: HTMLCanvasElement): WebGLRenderer {
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: this.output.alpha })
    renderer.setPixelRatio(this.output.pixelRatio ?? window.devicePixelRatio)
    // Clear to nothing rather than to a colour, so a scene drawn for compositing hands back the
    // pixels it painted and nothing else. `setClearAlpha` alone is ignored without `alpha`.
    if (this.output.alpha) renderer.setClearAlpha(0)
    renderer.toneMapping = this.options.toneMapping ? ACESFilmicToneMapping : NoToneMapping
    // The pass a game applies too; `configure` refines the filter. Drawn when this engine says so,
    // never per frame: `requestRender` is what says a shadow could have moved, and a camera frame
    // goes through `requestCameraRender` instead. Stale from here, so a context rebuilt under a
    // mounted engine draws its maps on the first frame rather than showing none until something moves.
    applyShadowPolicy(renderer, {
      ...DEFAULT_RENDER_POLICY,
      shadows: this.options.shadows ?? false,
    })
    this.shadowsStale = true
    this.allShadowsStale = true
    // three.js clears the counters at the top of every `render`, and the overlay pass calls
    // `render` a second time — left automatic, a frame would report the trihedron alone.
    renderer.info.autoReset = false
    return renderer
  }

  private mountControls(canvas: HTMLCanvasElement): void {
    if (this.options.controls !== 'none') {
      this.controls = new OrbitControls(this.camera, canvas)
      this.controls.enableDamping = true
      this.controls.addEventListener('change', this.requestCameraRender)
      // On `end` rather than on `change`: the latter fires per frame of an orbit, and whoever
      // listens here publishes into a store. Once the hand lets go is when the framing is a
      // decision rather than a gesture in progress.
      const settled = this.options.onCameraSettled
      if (settled) this.controls.addEventListener('end', () => settled(0))
    }
  }

  private mountNavigation(host: HTMLElement): void {
    // Capture, and on the HOST rather than the canvas: a capture on an ancestor runs ahead of
    // every listener of the canvas whatever order those were added in — and `TransformControls`
    // is one of them, grabbing from whichever camera it holds when it reads the event.
    this.host = host
    host.addEventListener('pointerdown', this.armPaneUnderPointer, true)
    host.addEventListener('pointermove', this.armPaneUnderPointer, true)
    // After the arming, never before: it settles which pane is worked in, and this reads that.
    host.addEventListener('pointerdown', this.onNavigate, true)
    // The rest of the gesture on the WINDOW, and no pointer capture at all: a drag straying off
    // the panel must go on turning, and `TransformControls` grabs the very same canvas — a
    // capture taken here is one taken from IT, and released under a handle still being pulled.
    window.addEventListener('pointermove', this.onNavigate, true)
    window.addEventListener('pointerup', this.onNavigateRelease, true)
    // A finger the browser takes back — a scroll gesture, a system edge swipe — sends this and
    // never a `pointerup`, and the pair it belonged to would go on steering the view.
    window.addEventListener('pointercancel', this.onNavigateRelease, true)
    // Not passive: the dolly cancels the event, and a passive listener may not. On the host for
    // the reason above — `OrbitControls` posts its own wheel listener on the canvas.
    host.addEventListener('wheel', this.onWheelCapture, { capture: true, passive: false })
  }

  private observeCanvas(canvas: HTMLCanvasElement): void {
    this.observer = new ResizeObserver(() => {
      if (this.onResize()) this.drawPendingFrame()
    })
    this.observer.observe(canvas)
  }

  dispose(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null

    this.observer?.disconnect()
    this.observer = null

    this.controls?.removeEventListener('change', this.requestCameraRender)
    this.controls?.dispose()
    this.controls = null

    while (this.extras.length > 0) this.disposeExtra()

    this.host?.removeEventListener('pointerdown', this.armPaneUnderPointer, true)
    this.host?.removeEventListener('pointermove', this.armPaneUnderPointer, true)
    this.host?.removeEventListener('pointerdown', this.onNavigate, true)
    window.removeEventListener('pointermove', this.onNavigate, true)
    window.removeEventListener('pointerup', this.onNavigateRelease, true)
    window.removeEventListener('pointercancel', this.onNavigateRelease, true)
    // Cleared like the wheel's own registers: a drag left set is one the next mount resumes
    // from coordinates a panel ago, and the camera jumps on the first move.
    this.drag = null
    this.pinch = null
    this.touches.clear()
    this.host?.removeEventListener('wheel', this.onWheelCapture, true)
    this.host = null

    this.navigationTarget.dispose()

    if (this.insetCatchUp !== null) clearTimeout(this.insetCatchUp)
    this.insetCatchUp = null
    this.disposeInset()

    const canvas = this.renderer?.domElement
    this.renderer?.forceContextLoss()
    this.renderer?.dispose()
    this.renderer = null
    this.gpuTimer = null

    // The canvas goes with the engine that made it: left behind, the next mount would stack a
    // second one on top of it and the host would keep growing a dead canvas per remount.
    canvas?.remove()
  }

  get canvas(): HTMLCanvasElement | null {
    return this.renderer?.domElement ?? null
  }

  /** The renderer itself, for the passes and overlays that have to draw with it. */
  get gl(): WebGLRenderer | null {
    return this.renderer
  }

  get orbit(): OrbitControls | null {
    return this.controls
  }

  /** Reads a studio token off the canvas, so a viewport follows a theme change with the rest. */
  paletteToken(name: string): string {
    const canvas = this.renderer?.domElement
    return canvas ? token(canvas, name) : ''
  }

  setBackgroundColor(css: string): void {
    this.scene.background = css ? new Color(css) : null
    // What stands behind the objects is part of what a scene camera films, so the preview is as
    // out of date as the panes are.
    this.invalidateInset()
    this.requestRender()
  }

  /**
   * How many device pixels one CSS pixel buys. The single lever a quality setting pulls: nothing
   * about the assets moves, only how finely the same frame is drawn.
   *
   * Held to the screen's own ratio at the top — asking for more than the display has is paying
   * for pixels nobody can see.
   */
  setPixelRatio(ratio: number): void {
    const renderer = this.renderer
    if (!renderer) return

    const wanted = Math.min(ratio, window.devicePixelRatio)
    if (renderer.getPixelRatio() === wanted) return

    renderer.setPixelRatio(wanted)
    // The drawing buffer is sized from the ratio, so it has to be laid out again — `setSize`
    // multiplies by the ratio it finds at the moment it runs.
    this.onResize()
    this.invalidateInset()
  }

  setFieldOfView(degrees: number): void {
    if (this.perspective.fov === degrees) return
    this.perspective.fov = degrees
    this.perspective.updateProjectionMatrix()
    // The orthographic frustum is derived from the field of view, so it moves with it.
    this.fitProjection()
    this.requestRender()
  }
}
