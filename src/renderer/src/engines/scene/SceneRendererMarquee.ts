import { gestureOf, maskOf } from '../viewport/gestures'
import { aimAlong, turnBy } from '../viewport/lookAround'
import { boxBetween, type ScreenBox } from './marqueeSelection'
import type { Vector3 as PlainVector3 } from '@shared/domain/scene'
import { railOf } from './nodeRail'
import { nearestSegment } from './bonePicking'
import './bvhPatches'
import { extendsSelection, wasClick } from './sceneRendererSupport1'
import type { Marquee } from './sceneRendererSupport1'
import type { PickedPathPoint } from './sceneRendererSupport2'
import { SceneRendererPointer } from './SceneRendererPointer'
export abstract class SceneRendererMarquee extends SceneRendererPointer {
  protected abstract pathPointAt(event: PointerEvent): PickedPathPoint | null
  protected abstract nodeAt(event: PointerEvent): string | null
  protected abstract pickInMarquee(marquee: Marquee, event: PointerEvent): void
  protected abstract railSpotAt(event: PointerEvent): {
    nodeId: string
    point: PlainVector3
  } | null
  protected abstract pathSegmentAt(event: PointerEvent): {
    nodeId: string
    index: number
  } | null
  protected onPointerUp = (event: PointerEvent): void => {
    if (this.flightPointer && event.pointerId !== this.flightPointer.pointerId) return
    if (event.button === 2) {
      this.endRightButton(event)
      return
    }
    if (event.button === 0) this.endLeftButton(event)
  }

  private endLeftButton(event: PointerEvent): void {
    const pressed = this.pressed
    const flew = this.flew
    const marquee = this.marquee
    this.pressed = null
    this.dropMarquee()
    this.endFlight(0, event)
    // A rectangle that travelled takes what it crossed, and publishes even when it crossed
    // nothing: that is how a sweep through the void clears a selection.
    if (marquee && !flew && !wasClick(marquee.from, marquee.to)) {
      this.pickInMarquee(marquee, event)
      return
    }
    // A flight that moved the camera is not a click, even when the pointer never left its pixel:
    // the keyboard did the moving. The same reading the right button already makes for its menu.
    if (flew || !wasClick(pressed, event)) return
    // A click in the preview picks nothing: it is drawn through another camera, so a ray cast
    // from the pane underneath would select whatever the picture happens to be covering.
    if (this.viewport.insetHasPointer(event)) return
    if (this.sculptMode) return
    this.aimGizmo()
    if (this.poseMode) this.pickBoneAt(event)
    else this.pickAt(event)
  }

  /**
   * The right button, whose click is the one gesture left for a menu — the button itself being
   * taken by the fly camera.
   *
   * Never in pose mode: there a click names a bone, and a bone is not a node the menu could act
   * on. Never through the preview either, for the reason the left button gives: it is drawn
   * through another camera, so a ray cast from the pane underneath names what the picture covers.
   */
  private endRightButton(event: PointerEvent): void {
    const still = !this.flew && this.held.size === 0 && wasClick(this.flownFrom, event)
    this.endFlight(2, event)
    if (!still || this.poseMode || this.sculptMode || this.viewport.insetHasPointer(event)) return
    // A knob raises the menu of its POINT, and picks it on the way: what the menu acts on is then
    // what the gizmo holds, rather than two different things under one pointer.
    const knob = this.pathPointAt(event)
    if (knob) {
      this.options.onSelectPathPoint?.(knob)
      this.options.onPathPointMenu?.(knob.nodeId, knob.index)
      return
    }
    this.options.onContextMenu?.(this.nodeAt(event) ?? null)
  }

  /** In pose mode a click names a BONE — the nearest projected segment, or nothing. */
  private pickBoneAt(event: PointerEvent): void {
    const ndc = this.viewport.pointerNdcOf(event)
    if (!ndc) return
    const picked = nearestSegment(this.projectedSegments(this.cameraInHand()), {
      x: ndc.x,
      y: ndc.y,
    })
    this.options.onSelectBone?.(picked ? { nodeId: picked.nodeId, bone: picked.bone } : null)
  }

  private pickAt(event: PointerEvent): void {
    if (this.pickPathGesture(event)) return
    const id = this.nodeAt(event)
    this.options.onSelect(id ? [id] : [], extendsSelection(event) ? 'toggle' : 'replace')
    if (this.pickedPathPoint) this.options.onSelectPathPoint?.(null)
  }

  /** The rail gestures a modifier arms — closing a run, appending to it, taking or adding a knob. */
  private pickPathGesture(event: PointerEvent): boolean {
    if (event.altKey && event.shiftKey) {
      const first = this.pathPointAt(event)
      const run = first ? railOf(this.applied.get(first.nodeId)) : null
      if (first && !first.part && first.index === 0 && run && !run.closed) {
        this.options.onClosePath?.(first.nodeId)
        return true
      }
      const spot = this.railSpotAt(event)
      if (spot) this.options.onAppendPathPoint?.(spot.nodeId, spot.point)
      return true
    }
    const knob = this.pathPointAt(event)
    if (knob) {
      this.options.onSelectPathPoint?.(knob)
      return true
    }
    if (event.altKey) {
      const spot = this.pathSegmentAt(event)
      if (spot) {
        this.options.onAddPathPoint?.(spot.nodeId, spot.index)
        return true
      }
    }
    return false
  }
  /** Arms the rectangle on the button the scheme left free and nowhere else: under `custom` the
   * bare left one may still orbit, and the preview picks nothing at all. */
  protected armMarquee(event: PointerEvent): void {
    if (this.sculptMode) return
    // Never on a finger: one of them TURNS the view, whatever the mouse scheme says — see
    // `navigateByTouch`. A rectangle drawn under the turn would take every tap-and-drag.
    if (event.pointerType === 'touch') return
    const pane = this.viewport.paneAtPointer(event)
    if (pane === null || gestureOf(event, this.scheme) !== null) return
    const corner = this.viewport.canvasPointOf({ clientX: 0, clientY: 0 })
    if (!corner) return
    const at = { clientX: event.clientX, clientY: event.clientY }
    this.marquee = { pane, corner, from: at, to: at }
  }
  protected onPointerMove = (event: PointerEvent): void => {
    if (
      this.flownWith === 2 &&
      this.flightPointer &&
      event.pointerId === this.flightPointer.pointerId
    ) {
      if ((event.buttons & maskOf(2)) === 0) return this.endFlight(2, event)
      const deltaX = event.clientX - this.flightPointer.clientX
      const deltaY = event.clientY - this.flightPointer.clientY
      this.flightPointer = { ...this.flightPointer, clientX: event.clientX, clientY: event.clientY }
      if (deltaX !== 0 || deltaY !== 0) {
        this.look = turnBy(this.look, -deltaX, -deltaY)
        aimAlong(this.viewport.camera, this.look)
        this.flew = !wasClick(this.flownFrom, event)
        this.repaint()
      }
    }
    this.moveSculptPointer(event)
    const marquee = this.marquee
    if (!marquee) return
    // `buttons` is the reading that cannot lie: a release swallowed by a native menu, or a handle
    // that took the drag, both leave the rectangle hanging otherwise.
    if (this.gizmo?.dragging || (event.buttons & maskOf(0)) === 0) return this.dropMarquee()
    marquee.to = { clientX: event.clientX, clientY: event.clientY }
    // One publication a frame: the host re-renders on each of them, and a pointer reports faster
    // than the screen refreshes.
    if (this.marqueePending !== null) return
    this.marqueePending = requestAnimationFrame(() => {
      this.marqueePending = null
      if (this.marquee) this.options.onMarquee?.(this.drawnMarquee(this.marquee))
    })
  }
  protected readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.flightPointer && event.pointerId !== this.flightPointer.pointerId) return
    this.pressed = null
    this.dropMarquee()
    this.endReliefStroke()
    this.endFlight(this.flownWith ?? event.button, event)
  }
  /** The outline to draw, in the canvas' own pixels — `null` while the drag is still short
   * enough to be a click, so a pick never flashes a rectangle. */
  protected drawnMarquee(marquee: Marquee): ScreenBox | null {
    if (wasClick(marquee.from, marquee.to)) return null
    return boxBetween(
      { x: marquee.from.clientX + marquee.corner.x, y: marquee.from.clientY + marquee.corner.y },
      { x: marquee.to.clientX + marquee.corner.x, y: marquee.to.clientY + marquee.corner.y },
    )
  }
  /** Gives the rectangle up without picking anything. Silent when there was none to give. */
  protected dropMarquee(): void {
    if (!this.marquee) return
    this.marquee = null
    if (this.marqueePending !== null) cancelAnimationFrame(this.marqueePending)
    this.marqueePending = null
    this.options.onMarquee?.(null)
  }
}
