import { localizedError } from '@shared/localizedError'
import { PerspectiveCamera, WebGLRenderTarget, type WebGLRenderer } from 'three'
import type { MotionId } from '@shared/domain/shortcut'
import { anglesFromDirection } from '@shared/domain/angles'
import { aimAlong, turnBy } from '../viewport/lookAround'
import { clampFlySpeed, speedAfterWheel } from './flySpeed'
import { notchesOf } from '../viewport/dolly'
import { PIVOT_AHEAD } from '../viewport/orbitPivot'
import { aspectLoan } from '../viewport/aspectLoan'
import { encodeFilmFrameOffThread } from './filmEncodePort'
import { captureSize, type CaptureQuality } from '@shared/domain/sceneCapture'
import './bvhPatches'
import { flightGaze } from './sceneRendererSupport2'
import { SceneRendererFilm } from './SceneRendererFilm'
import { readRenderPixels } from './readRenderPixels'
export abstract class SceneRendererFlight extends SceneRendererFilm {
  protected abstract syncPaneFreeze(): void
  public abstract get flying(): boolean
  /**
   * What a still is captured AT, in buffer pixels.
   *
   * The pane in hand when there are four of them; the whole canvas when there is one — a quad
   * layout captured at the canvas's shape would show more scene than the pane it was asked of.
   * Times the device ratio, both measures above being CSS pixels while the frame on screen is
   * drawn at the buffer's own: « view size » on a 2× display gave back half the definition.
   */
  private captureShape(
    gl: WebGLRenderer,
    quality: CaptureQuality,
  ): { width: number; height: number } {
    const canvas = gl.domElement
    const shown = this.viewport.activePaneRegion() ?? {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    }
    const ratio = gl.getPixelRatio()
    return captureSize({ width: shown.width * ratio, height: shown.height * ratio }, quality)
  }

  /**
   * One still of the view being worked in, encoded as a PNG — what is posted, and what a
   * template thumbnail is drawn with.
   *
   * Off screen and through the same door a film goes through: `hideWorkshop` takes the grid, the
   * gizmos, the rails and the light bodies out, so what comes back is the SCENE and not a
   * picture of the workshop around it. The framing never changes — only the pixel count does.
   *
   * The colour is encoded on the way out (`flipToSrgbInto`): three writes the working space into
   * a render target, and a linear buffer written straight into a PNG comes out washed out.
   */
  async captureStill(quality: CaptureQuality): Promise<Uint8Array> {
    const gl = this.viewport.gl
    if (!gl) throw localizedError('captureViewportMissing')
    const camera = this.cameraInHand()
    const { width, height } = this.captureShape(gl, quality)
    // Antialiased, unlike a film's frames: a still is looked at, and the resolve happens at the
    // end of `render` — so the read below already has the resolved texture. Capped at four,
    // which is where the eye stops paying for the memory a 4K target multiplies.
    const samples = Math.min(4, gl.capabilities.maxSamples)
    const target = new WebGLRenderTarget(width, height, { samples })
    const restore = this.hideWorkshop()
    const loan = aspectLoan(width, height)
    try {
      // Only a perspective one is lent an aspect, and only for the rounding: the size asked for
      // keeps the view's own shape, so an orthographic frustum is already framed for it.
      if (camera instanceof PerspectiveCamera) loan.frame(camera)
      const composed = this.viewport.drawScene({
        scene: this.viewport.scene,
        camera,
        surface: 'offscreen',
        paneIndex: 0,
        // The view in hand rather than a camera of the document, so the composition is the
        // SCENE's — which is exactly what is on screen.
        cameraNodeId: null,
        target,
        rect: null,
        width,
        height,
      })
      const pixels = readRenderPixels(gl, target, width, height)
      return await encodeFilmFrameOffThread(pixels, width, height, composed)
    } finally {
      gl.setRenderTarget(null)
      target.dispose()
      this.post?.releaseSurface('offscreen')
      loan.restore()
      restore()
      this.redraw()
    }
  }
  /**
   * Arms the persistent navigation mode: the pointer is captured, the mouse becomes the head and
   * the keys fly without a button held.
   *
   * The capture is what settles the keyboard too — `flying` covers this mode, so `S` means back
   * rather than scale for exactly as long as the mode is on.
   */
  setNavigating(on: boolean): void {
    if (on === this.navigating) return
    const canvas = this.viewport.canvas
    if (on) {
      if (!canvas) return
      this.navigating = true
      this.catchLook()
      document.addEventListener('pointerlockchange', this.onPointerLockChange)
      canvas.addEventListener('pointermove', this.onLookMove)
      // Before the first turn: an orbit left running ends its frame on `lookAt(target)`, which
      // is exactly the rotation this mode writes — the head would snap back every frame.
      this.syncPaneFreeze()
      // A capture refused — no gesture behind the call — must not leave the bar lit over a mode
      // that never opened. Not awaited, so the `.catch` is a handler, not a chain under an await.
      void canvas.requestPointerLock()?.catch(() => this.setNavigating(false))
      // Before the first frame of the mode, or its opening step spans the whole idle time.
      this.viewport.resetClock()
      this.repaint()
      return
    }
    this.navigating = false
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    canvas?.removeEventListener('pointermove', this.onLookMove)
    if (document.pointerLockElement === canvas) document.exitPointerLock()
    this.held.clear()
    // Only for a mode that engaged: a capture refused never flew anywhere, and resting the pivot
    // would swing the next drag for a reason nothing on screen explains.
    if (this.captured) this.restPivot()
    this.captured = false
    // After `restPivot`: thawing re-arms the orbit, and it must find the pivot already ahead.
    this.syncPaneFreeze()
    this.options.onNavigatingChange?.(false)
    this.repaint()
  }
  /**
   * Heading off the camera. `this.look` starts at DEFAULT_LOOK (+Z, level); a right-button drag
   * that skipped this aimed there on the first pixel and the framed subject left the view.
   */
  protected catchLook(): void {
    this.look = anglesFromDirection(this.viewport.camera.getWorldDirection(flightGaze), this.look)
  }

  /**
   * Put back ahead of the camera: left where a flight walked away from it, the first drag
   * afterwards orbits a point off screen — the trap `turnToViewHelper` guards the trihedron against.
   */
  protected restPivot(): void {
    const orbit = this.viewport.orbit
    if (!orbit) return
    const camera = this.viewport.camera
    orbit.target
      .copy(camera.position)
      .addScaledVector(camera.getWorldDirection(flightGaze), PIVOT_AHEAD)
    orbit.update()
  }
  /** Escape releases the capture without telling this engine; the browser's own event does. */
  protected onPointerLockChange = (): void => {
    if (document.pointerLockElement === this.viewport.canvas) {
      this.captured = true
      return
    }
    this.setNavigating(false)
  }
  /** Sign flipped against `turnBy`, written for a hand that GRABS the world: here the mouse IS the head. */
  protected onLookMove = (event: PointerEvent): void => {
    if (!this.navigating) return
    this.look = turnBy(this.look, -event.movementX, -event.movementY)
    aimAlong(this.viewport.camera, this.look)
    this.repaint()
  }
  /**
   * The wheel means speed in the armed MODE alone, never under a held button: there the wheel
   * still dollies, which is what the manual promises and what the hint — mode-only — could say.
   */
  protected spendWheelOnSpeed(event: WheelEvent): boolean {
    if (!this.navigating && this.flownWith !== 2) return false
    this.sessionFlySpeed = speedAfterWheel(this.flySpeed, notchesOf(event.deltaY))
    this.options.onFlySpeedChange?.(this.sessionFlySpeed)
    return true
  }
  /**
   * The same session speed the wheel writes, set from a surface instead — the snap bar. Clamped
   * here rather than at the caller: two surfaces reaching the same value must share its bounds.
   */
  setFlySpeed(speed: number): void {
    this.sessionFlySpeed = clampFlySpeed(speed)
    this.options.onFlySpeedChange?.(this.sessionFlySpeed)
  }
  /** What this session flies at: the wheel's value while one was set, the preference otherwise. */
  protected get flySpeed(): number {
    return this.sessionFlySpeed ?? this.view.flySpeed
  }
  setMotion(held: Set<MotionId>): void {
    this.held.clear()
    for (const motion of held) this.held.add(motion)
    if (this.flying && this.held.size > 0) this.redraw()
  }
}
