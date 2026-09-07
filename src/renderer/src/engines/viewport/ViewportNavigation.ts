import { PerspectiveCamera } from 'three'
import { type OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { pinchReading } from './pinch'
import { gestureOf, type Gesture } from './gestures'
import { SCHEME_OF } from '@shared/domain/navigationPreset'
import { pointerNdc, type PointerPosition } from './pointer'
import { allows } from './viewportEngineSupport1'
import type { Pinch } from './viewportEngineSupport1'
import { ViewportSurface } from './ViewportSurface'

export abstract class ViewportNavigation extends ViewportSurface {
  protected abstract dragBy(event: PointerEvent): void

  protected abstract endDrag(): void

  protected abstract applyGesture(
    kind: Gesture,
    camera: PerspectiveCamera,
    orbit: OrbitControls,
    deltaX: number,
    deltaY: number,
    height: number,
  ): void

  /**
   * Where a pointer sits in device coordinates, or `null` if the canvas has no surface yet.
   *
   * Relative to the PANE under it, not to the canvas: a ray cast from a quarter-sized view with
   * whole-canvas coordinates lands somewhere the pointer never was. `inPane` pins that pane —
   * what a gesture that started in one and travelled out of it has to measure against.
   */
  pointerNdcOf(pointer: PointerPosition, inPane?: number): { x: number; y: number } | null {
    const canvas = this.renderer?.domElement
    if (!canvas) return null

    const bounds = canvas.getBoundingClientRect()
    const pane = this.rects[inPane ?? this.paneAtPointer(pointer) ?? 0]
    if (!pane) return pointerNdc(pointer, bounds)

    return pointerNdc(pointer, {
      left: bounds.left + pane.x,
      top: bounds.top + pane.y,
      width: pane.width,
      height: pane.height,
    })
  }

  /** Pane 0 is the main orbit; the rest read one past their own index, as the cameras do. */
  protected orbitOfPane(index: number): OrbitControls | null {
    return index === 0 ? this.controls : (this.extras[index - 1]?.controls ?? null)
  }

  /** The wheel, taken from `OrbitControls` for perspective panes — why, in `dolly.ts`. */
  protected readonly onWheelCapture = (event: WheelEvent): void => {
    if (this.options.onWheel?.(event) === true) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    const index = this.paneAtPointer(event)
    if (index === null) return

    const camera = this.cameraOfPane(index)
    const orbit = this.orbitOfPane(index)
    // An orthographic pane keeps the wheel `OrbitControls` gives it: it shows the same thing
    // wherever it stands, so it zooms by scaling its frustum. Its `zoomToCursor` is NOT the way to
    // anchor it — that one reads the whole canvas, so it drifts in every pane of a quad layout.
    if (!(camera instanceof PerspectiveCamera) || !orbit || this.armedPane !== index) return

    if (!this.navigationTarget.wheel(event, index, camera, orbit)) return

    event.preventDefault()
    event.stopPropagation()
  }

  /**
   * The drag, taken from `OrbitControls` for the reason `orbit.ts` carries. Registered AFTER
   * `armPaneUnderPointer`, which settles which pane is worked in before this reads it.
   */
  protected readonly onNavigate = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return this.navigateByTouch(event)
    if (event.type !== 'pointerdown') return this.dragBy(event)

    const kind = gestureOf(event, this.options.scheme?.() ?? SCHEME_OF.studio)
    if (kind === null) return this.dragBy(event)

    const index = this.paneAtPointer(event)
    if (index === null || !this.takesDrag(kind, index)) return this.dragBy(event)

    this.endDrag()
    this.startDrag(kind, index, event.pointerId, event.button, event)
  }

  /** Whether that pane answers that gesture at all. Perspective only, exactly as the wheel: an
   * orthographic pane keeps every gesture `OrbitControls` gives it. */
  protected takesDrag(kind: Gesture, pane: number): boolean {
    const camera = this.cameraOfPane(pane)
    const orbit = this.orbitOfPane(pane)
    if (!(camera instanceof PerspectiveCamera) || !orbit || this.armedPane !== pane) return false

    return allows(orbit, kind)
  }

  /** The pivot is NOT laid here: the capture listener that calls this runs ahead of the gizmo,
   * which may grab its handle on this very press — it is decided at the first move. */
  protected startDrag(
    kind: Gesture,
    pane: number,
    pointerId: number,
    button: number,
    at: PointerPosition,
  ): void {
    this.drag = {
      kind,
      pane,
      pointerId,
      button,
      clientX: at.clientX,
      clientY: at.clientY,
      pressedAt: { clientX: at.clientX, clientY: at.clientY },
      moved: false,
    }
  }

  /** What fingers do, which no scheme spells: a touch surface has no buttons to build a chord
   * from, so one turns the view and two pan and dolly it. */
  protected navigateByTouch(event: PointerEvent): void {
    if (event.type === 'pointerdown') return this.addFinger(event)

    const held = this.touches.get(event.pointerId)
    if (!held) return
    held.clientX = event.clientX
    held.clientY = event.clientY

    if (this.pinch) this.pinchBy(this.pinch)
    else this.dragBy(event)
  }

  protected addFinger(event: PointerEvent): void {
    const pane = this.paneAtPointer(event)
    if (pane === null) return

    this.touches.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
    const two = this.twoFingers()
    if (!two) {
      if (this.takesDrag('orbit', pane)) this.startDrag('orbit', pane, event.pointerId, 0, event)
      return
    }

    // The one-finger turn is over the moment a second lands: kept, it would go on turning by
    // whichever finger happened to move, on top of the pan the pair is asking for.
    this.endDrag()
    this.pinch = { pane, ...pinchReading(two), moved: false }
  }

  /** The first two fingers down, handed over as the map holds them — `null` while there is one. */
  protected twoFingers(): [PointerPosition, PointerPosition] | null {
    const [first, second] = this.touches.values()
    return first && second ? [first, second] : null
  }

  /** Both at once, as every touch surface does them: the middle pans, the gap dollies. */
  protected pinchBy(pinch: Pinch): void {
    const two = this.twoFingers()
    const camera = this.cameraOfPane(pinch.pane)
    const orbit = this.orbitOfPane(pinch.pane)
    if (!two || !(camera instanceof PerspectiveCamera) || !orbit) return
    if (this.armedPane !== pinch.pane) return this.endPinch()

    const height = this.rects[pinch.pane]?.height ?? 0
    if (height === 0) return

    const { gap, middleX, middleY } = pinchReading(two)
    pinch.moved = true

    if (orbit.enablePan) {
      this.applyGesture(
        'pan',
        camera,
        orbit,
        middleX - pinch.middleX,
        middleY - pinch.middleY,
        height,
      )
    }
    // Spreading closes in, as it does everywhere: a gap that grew is a positive delta, which is
    // what `dragNotchesOf` reads as travelling right.
    if (orbit.enableZoom) this.applyGesture('dolly', camera, orbit, gap - pinch.gap, 0, height)

    pinch.gap = gap
    pinch.middleX = middleX
    pinch.middleY = middleY
  }

  protected endPinch(): void {
    const pinch = this.pinch
    this.pinch = null
    if (pinch?.moved) this.options.onCameraSettled?.(pinch.pane)
  }
}
