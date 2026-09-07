import { PerspectiveCamera } from 'three'
import { type OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { dollyTo, dragNotchesOf } from './dolly'
import { pinchReading } from './pinch'
import { type Gesture } from './gestures'
import { orbitAround } from './orbit'
import { panBy } from './pan'
import { borrowedAim, aimPivotAhead } from './viewportEngineSupport1'
import { ViewportNavigation } from './ViewportNavigation'

export abstract class ViewportRenderLoop extends ViewportNavigation {
  protected abstract readonly renderFrame: () => void

  protected releaseTouch(event: PointerEvent): void {
    this.touches.delete(event.pointerId)
    if (!this.pinch) {
      if (this.drag?.pointerId === event.pointerId) this.endDrag()
      return
    }

    const pane = this.pinch.pane
    this.endPinch()
    // Three fingers down and one lifted still leaves a PAIR: read as a single finger, the pinch
    // died and the pan came back only once every finger had left the glass.
    const two = this.twoFingers()
    if (two) {
      this.pinch = { pane, ...pinchReading(two), moved: false }
      return
    }

    // The finger still down takes the view back, anchored where it IS: resumed from where the
    // pair began, the view would jump the whole way the two of them travelled.
    const [id, at] = this.touches.entries().next().value ?? []
    if (id !== undefined && at && this.takesDrag('orbit', pane)) {
      this.startDrag('orbit', pane, id, 0, at)
    }
  }

  protected dragBy(event: PointerEvent): void {
    const drag = this.drag
    if (!drag || event.pointerId !== drag.pointerId) return
    if (event.buttons === 0 || this.armedPane !== drag.pane) return this.endDrag()

    const camera = this.cameraOfPane(drag.pane)
    const orbit = this.orbitOfPane(drag.pane)
    // A pane whose camera was swapped mid-drag has nothing left to turn — see `setPaneCamera`.
    if (!(camera instanceof PerspectiveCamera) || !orbit) return this.endDrag()

    const deltaX = event.clientX - drag.clientX
    const deltaY = event.clientY - drag.clientY
    drag.clientX = event.clientX
    drag.clientY = event.clientY
    if (deltaX === 0 && deltaY === 0) return

    const height = this.rects[drag.pane]?.height ?? 0
    if (height === 0) return
    drag.moved = true

    if (drag.pressedAt) {
      if (drag.kind === 'orbit')
        orbit.target.copy(this.navigationTarget.pivotAt(drag.pressedAt, camera, orbit))
      drag.pressedAt = null
    }
    this.applyGesture(drag.kind, camera, orbit, deltaX, deltaY, height)
  }

  /** What a gesture DOES to a view, whatever named it — a chord of buttons or a pair of fingers. */
  protected applyGesture(
    kind: Gesture,
    camera: PerspectiveCamera,
    orbit: OrbitControls,
    deltaX: number,
    deltaY: number,
    height: number,
  ): void {
    if (kind === 'dolly') this.dollyDrag(camera, orbit, deltaX, deltaY)
    else {
      const common = {
        position: camera.position,
        quaternion: camera.quaternion,
        pivot: orbit.target,
        deltaX,
        deltaY,
        height,
      }

      if (kind === 'orbit') {
        const move = orbitAround(common)
        camera.position.copy(move.position)
        camera.quaternion.copy(move.quaternion)
      } else {
        const move = panBy({ ...common, fieldOfView: camera.fov })
        camera.position.copy(move.position)
        orbit.target.copy(move.pivot)
      }
    }

    this.requestCameraRender()
  }

  /** The chord dolly: along the line of sight, towards the pivot rather than towards a pointer
   * that is itself travelling — see `dolly.ts`. */
  protected dollyDrag(
    camera: PerspectiveCamera,
    orbit: OrbitControls,
    deltaX: number,
    deltaY: number,
  ): void {
    // A camera orbited earlier in this very frame still carries the last frame's world matrix,
    // and the direction below is read out of it — the same reading `pivotAt` makes.
    camera.updateMatrixWorld()
    const move = dollyTo({
      position: camera.position,
      aim: camera.getWorldDirection(borrowedAim),
      aimed: orbit.target,
      notches: dragNotchesOf(deltaX, deltaY),
    })

    camera.position.copy(move.position)
    // Exactly what the wheel does when it crosses what it aimed at — see `onWheelCapture`.
    if (move.pivot) orbit.target.copy(move.pivot)
    else aimPivotAhead(camera, orbit.target)
  }

  /** `buttons === 0` is the reading that cannot lie: two buttons released out of order. */
  protected readonly onNavigateRelease = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return this.releaseTouch(event)
    // The same reading `dragBy` makes: a second pointer going up must not end a mouse's orbit.
    const drag = this.drag
    if (event.pointerId !== drag?.pointerId) return
    // The button that NAMED the gesture ends it, even with another still down: Unreal pans on the
    // right added to the left, and reading `buttons` alone kept panning under the left alone.
    if (event.type === 'pointerup' && event.buttons !== 0 && event.button !== drag.button) return
    this.endDrag()
  }

  protected endDrag(): void {
    const drag = this.drag
    this.drag = null
    // A press that never travelled a pixel is not a framing anybody decided — see the note on
    // `onCameraSettled`, which a store reads and repaints everything from.
    if (drag?.moved === true) this.options.onCameraSettled?.(drag.pane)
  }

  /**
   * Starts the frame clock now. A caller about to animate calls this first, or the first delta
   * it receives spans everything since the last frame — which was the last time anything moved,
   * possibly minutes ago — and the motion opens with a jump.
   */
  resetClock(): void {
    this.lastTime = performance.now()
  }

  readonly requestRender = (): void => {
    // Stale by DEFAULT, and only ever cleared by a frame that drew: whoever forgets to say what
    // moved pays a shadow pass, and whoever forgets the other way shows a shadow of what was.
    this.shadowsStale = true
    this.allShadowsStale = true
    this.schedule()
  }

  /** Schedules a depth pass that `onShadowFrame` may limit to changed lights. */
  readonly requestShadowRender = (): void => {
    this.shadowsStale = true
    this.schedule()
  }

  /**
   * A frame the CAMERA alone asked for — an orbit, a fly, a damping settling.
   *
   * A shadow map is drawn from a light, never from the camera, so the one drawn last still
   * holds. Measured while orbiting on this Mac at 1600×900: 2.6 ms against 1.9 for one sun over
   * 400 shadowed spheres, and 4.9 against 2.2 for four point lights, which cast six faces each.
   */
  readonly requestCameraRender = (): void => {
    this.schedule()
  }

  protected schedule(): void {
    if (this.frame !== null || this.renderer === null) return
    this.frame = requestAnimationFrame(this.renderFrame)
  }
}
