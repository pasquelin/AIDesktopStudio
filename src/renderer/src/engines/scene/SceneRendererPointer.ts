import { gestureOf } from '../viewport/gestures'
import { type NodeMove, type SceneNode } from './sceneState'
import './bvhPatches'
import { SceneRendererPose } from './SceneRendererPose'

export abstract class SceneRendererPointer extends SceneRendererPose {
  protected abstract dropMarquee(): void

  protected abstract turnToViewHelper(event: PointerEvent): boolean

  protected abstract armMarquee(event: PointerEvent): void

  /** Redraws nodes from what was last applied, undoing what a gesture moved without meaning to. */
  protected resync(moves: readonly NodeMove[]): void {
    const back: SceneNode[] = []
    for (const move of moves) {
      const node = this.applied.get(move.id)
      if (!node) continue
      this.applied.delete(move.id)
      this.syncNode(node)
      back.push(node)
    }
    this.poseMarkers(back)
    this.redraw()
  }

  /**
   * Read back from what is TRUE rather than left to the events that turn it on: a release
   * swallowed by a native menu, or a drag ended off the window, would leave the views frozen for
   * good, and a frozen viewport picks with the camera of a pane one has left — nothing selects.
   */
  protected syncPaneFreeze(): void {
    // `flownWith === 2`, not `flying`: a flight under the LEFT button is orbiting at the same
    // time, and freezing would take that orbit away — see `startFlight`. The armed mode DOES
    // freeze: `OrbitControls.update()` ends on `lookAt(target)` and would undo every turn.
    this.viewport.freezePanes(
      this.gizmo?.dragging === true || this.flownWith === 2 || this.navigating || this.viewDriven,
    )
  }

  protected onPointerAim = (event: PointerEvent): void => {
    // A drag nobody holds any more. `TransformControls.pointerUp` returns before clearing
    // `dragging` unless the button released is the LEFT one, so a right click mid-drag — the fly
    // camera's own button — leaves it set for good, and the views frozen with it. No button down
    // is the one reading that cannot lie; clearing it dispatches, so the freeze lifts by itself.
    if (event.buttons === 0 && this.gizmo?.dragging) this.gizmo.dragging = false

    // Any movement repairs a freeze that outlived its gesture.
    this.syncPaneFreeze()
    this.aimGizmo()
    // The store settles for itself whether this is news — see `setActivePane`.
    this.options.onPane?.(this.viewport.activePane)
  }

  protected startFlight(event: PointerEvent): void {
    this.flownFrom = { clientX: event.clientX, clientY: event.clientY }
    this.flightPointer = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
    }
    this.flownWith = event.button
    this.flew = false
    this.catchLook()
    // The RIGHT button only. `freezePanes` ends in `armOrbits(null)`, which sets
    // `controls.enabled = false` on the main orbit — freezing under the left button would cost
    // that button the rotation it is held down for.
    if (event.button === 2) this.viewport.freezePanes(true)
    // Before the first frame of the flight, or its opening step spans the whole idle time.
    this.viewport.resetClock()
    this.redraw()
  }

  /** `buttons === 0` is the reading that cannot lie: pressing both and letting go out of order
   * would otherwise leave a flight armed under a hand that holds nothing. */
  releaseNavigation(): void {
    this.setNavigating(false)
    this.setMotion(new Set())
    this.endFlight(this.flownWith ?? 0, { buttons: 0 })
  }

  protected endFlight(button: number, event: Pick<PointerEvent, 'buttons'>): void {
    if (this.flownWith !== button && event.buttons !== 0) return

    const froze = this.flownWith === 2
    this.flownFrom = null
    this.flightPointer = null
    this.flownWith = null
    // Not while the mode is armed: it owns the keys with no button down, and a click that ends
    // this button's flight would stop a camera whose `W` is still physically held — `useShortcuts`
    // pushes nothing again until the next key transition.
    // Nor while the letters are the camera's for good: the release of a click that armed
    // nothing would stop a camera whose key is still physically held.
    if (!this.navigating && this.scheme.fly !== 'always') this.held.clear()
    // Only what froze thaws: the left button never froze anything, and thawing would re-arm the
    // orbits it never took. Asked rather than asserted, a handle may still be held under it.
    if (froze) this.syncPaneFreeze()
  }

  protected onPointerDown = (event: PointerEvent): void => {
    if (event.button === 2) {
      // Not a flight when the scheme spends this press on a gesture: three of the six dolly on
      // Alt+right, and one pans on the right button added to a left already down. The viewport
      // took it in the capture phase, and a flight here would freeze the panes under it.
      if (gestureOf(event, this.scheme) === null) this.startFlight(event)
      else {
        // Remembered all the same: a chord that never TRAVELS is a click, and the node menu is
        // the one gesture left to this button. A rectangle is not that gesture — it goes.
        this.flownFrom = { clientX: event.clientX, clientY: event.clientY }
        this.flew = false
        this.dropMarquee()
      }
      return
    }
    if (event.button !== 0 || this.gizmo?.dragging) return
    // The trihedron is drawn over the viewport, so it takes the click before the scene does — and
    // nothing is armed for a selection the click never meant.
    if (this.turnToViewHelper(event)) return
    // Held, not acted on: `OrbitControls` pans on left-drag with any of the three modifiers, and
    // those are the very keys that add to a selection. Picking on release, and only if the
    // pointer never moved, is what stops a recentring gesture from unpicking what it passes over.
    this.pressed = { clientX: event.clientX, clientY: event.clientY }
    // Cleared here and not only in `startFlight`, which a scheme flying on the right button
    // alone never calls for this press.
    this.flew = false
    if (this.sculptMode) {
      if (this.beginReliefStrokeFrom(event)) return
    } else this.armMarquee(event)
    // ADDED to the left button, never substituted for what it already did: it goes on drawing its
    // rectangle and picking on release, and only gains the keys. Unity and Unreal keep their
    // flight on the RIGHT button alone, so under those the left one arms nothing.
    if (this.scheme.fly === 'anyButton') this.startFlight(event)
  }
}
