import { VIEW_DISTANCE } from '@shared/domain/renderPolicy'
import { OrthographicCamera, PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { paneRects, type PaneRect } from './panes'
import { aimPivotAhead, cameraOf } from './viewportEngineSupport1'
import type { ViewportOutput, ProjectionKind, ExtraPane } from './viewportEngineSupport1'
import { ViewportPaneLayout } from './ViewportPaneLayout'

export abstract class ViewportMounting extends ViewportPaneLayout {
  public abstract readonly requestCameraRender: () => void

  public abstract readonly requestRender: () => void

  /**
   * Says that what the preview SHOWS has changed — as opposed to `requestRender`, which says the
   * canvas has to be painted again.
   *
   * The two are not the same question, and that is the whole gain: orbiting, flying and settling
   * move the view without moving one thing a scene camera films, and those frames now composite
   * a picture already drawn instead of walking the scene a second time. Measured on a scene of
   * 1 504 nodes: the second pass cost 5,1 ms of CPU for 0,38 ms of GPU.
   *
   * Whoever owns the scene calls this — `SceneRenderer.redraw` does both at once, and a guard
   * holds it to that, because a missed call shows the wrong instant while a spare one costs a
   * single frame.
   */
  invalidateInset(): void {
    this.insetStale = true
  }

  protected createExtra(): ExtraPane {
    const near = this.options.near ?? 0.1
    const far = this.options.far ?? VIEW_DISTANCE

    const orthographic = new OrthographicCamera()
    orthographic.near = near
    orthographic.far = far
    const perspective = new PerspectiveCamera(this.options.fieldOfView ?? 60, 1, near, far)
    const pane: ExtraPane = {
      perspective,
      orthographic,
      projection: 'orthographic',
      controls: null,
      borrowed: null,
    }

    const canvas = this.renderer?.domElement
    if (this.options.controls === 'none' || !canvas) return pane

    const controls = new OrbitControls(orthographic, canvas)
    controls.enableDamping = true
    controls.addEventListener('change', this.requestCameraRender)
    // Only the pane under the pointer listens — see `armPaneUnderPointer`. Four live orbits on
    // one canvas would each answer the same drag, and the three off-screen ones would answer it
    // invisibly.
    controls.enabled = false
    // The index is read at the moment of the event rather than captured: panes are pushed after
    // this returns, so nothing here knows yet which one this will be.
    controls.addEventListener('end', () =>
      this.options.onCameraSettled?.(this.extras.indexOf(pane) + 1),
    )
    pane.controls = controls
    return pane
  }

  /**
   * Draws a pane through a camera of the SCENE rather than through its own.
   *
   * The orbit follows: left on the camera nobody is drawing, a drag would turn something
   * invisible. Handing it the borrowed camera is what makes orbiting in that pane MOVE the
   * camera of the scene — which is the whole point, and why `onCameraSettled` carries the pane.
   */
  setPaneCamera(index: number, camera: PerspectiveCamera | null): void {
    // Pane 0 draws with the viewport's own camera and reads `extras[-1]`, which is nobody.
    const pane = this.extras[index - 1]
    if (!pane || pane.borrowed === camera) return

    pane.borrowed = camera
    const drawn = cameraOf(pane)
    if (pane.controls) {
      pane.controls.object = drawn
      // Both ways round, a lent camera and one handed back: `update()` ends on `lookAt(target)`,
      // so a target left where the pane last turned swings that camera the moment it changes hands.
      aimPivotAhead(drawn, pane.controls.target)
      this.armOrbits(this.armedPane)
      pane.controls.update()
    }
    this.layOutPanes()
    this.requestRender()
  }

  /**
   * Which camera an added view draws through. The controls follow: an orbit left on the camera
   * that is no longer drawn turns something nobody sees.
   */
  setPaneProjection(index: number, kind: ProjectionKind): void {
    if (index === 0) return this.setProjection(kind)

    const pane = this.extras[index - 1]
    if (!pane || pane.projection === kind) return

    const previous = pane.projection === 'perspective' ? pane.perspective : pane.orthographic
    pane.projection = kind
    const next = kind === 'perspective' ? pane.perspective : pane.orthographic
    next.position.copy(previous.position)
    next.quaternion.copy(previous.quaternion)
    if (pane.controls) {
      // The two `setProjection` makes for pane 0, and for the same reason: an orthographic pane
      // takes its gestures back, and `update()` would swing it round a pivot left off the axis.
      if (kind === 'orthographic') aimPivotAhead(next, pane.controls.target)
      pane.controls.object = next
      this.armOrbits(this.armedPane)
    }

    this.layOutPanes()
    this.requestRender()
  }

  protected disposeExtra(): void {
    const pane = this.extras.pop()
    pane?.controls?.removeEventListener('change', this.requestRender)
    pane?.controls?.dispose()
  }

  /**
   * Hands the drag to the pane the pointer is over, and takes it from the others.
   *
   * Bound at mount rather than left to the caller: an orbit is the viewport's own gesture, and a
   * scene editor that had to arm it would be the second place deciding which view is being used.
   */
  protected readonly armPaneUnderPointer = (event: PointerEvent): void => {
    // A pointer that moved aims somewhere else, whatever else this call decides.
    this.navigationTarget.invalidate()

    // Kept before the early return, never after: the move that lifts a freeze is one this
    // returns on, and `freezePanes` has nothing to re-arm from unless that move was recorded.
    this.lastPointer.clientX = event.clientX
    this.lastPointer.clientY = event.clientY

    // `this.drag` beside the freeze: a navigation gesture holds the pointer just as a handle does,
    // and the pane under it must not change halfway — the wheel would then act on another view.
    if (this.layout !== 'single' && !this.frozen && !this.drag) {
      const over = this.paneAtPointer(event)
      if (over !== null) this.active = over
      this.armOrbits(over)
    }

    // Outside the guard above, and that is the point: a caller that thaws does it from here, and
    // it would never get the chance if a frozen viewport returned before saying anything.
    this.options.onPaneArmed?.(event)
  }

  /**
   * Where each pane sits, and what that does to the cameras that draw into them. Hands back the
   * main pane's rectangle, which is what the caller sizing the main camera needs.
   */
  protected layOutPanes(): PaneRect {
    const canvas = this.renderer?.domElement
    const width = canvas?.clientWidth ?? 0
    const height = canvas?.clientHeight ?? 0
    this.rects = paneRects(this.layout, width, height)

    for (const [index, pane] of this.extras.entries()) {
      // Pane 0 is the main camera's, so an extra reads the rect one past its own index. A pane
      // with no height is a viewport that has not been mounted yet: its frustum would come out
      // as a division by zero, and a camera holding NaN never draws again.
      const rect = this.rects[index + 1]
      if (!rect || rect.height === 0) continue

      const aspect = rect.width / rect.height
      const half = this.extraHeight / 2
      pane.orthographic.top = half
      pane.orthographic.bottom = -half
      pane.orthographic.right = half * aspect
      pane.orthographic.left = -half * aspect
      pane.orthographic.updateProjectionMatrix()
      pane.perspective.aspect = aspect
      pane.perspective.updateProjectionMatrix()

      // A borrowed camera too: one of the scene is built square, and a 1:1 frustum drawn into a
      // quarter of a wide canvas stretches everything it shows.
      if (pane.borrowed) {
        pane.borrowed.aspect = aspect
        pane.borrowed.updateProjectionMatrix()
      }
    }

    return this.rects[0] ?? { x: 0, y: 0, width, height }
  }

  /**
   * How the next mount builds its renderer. A method rather than a constructor option because
   * the engine that owns this one builds it as a field — so it has nothing to hand over yet —
   * and because both values are read once, when the WebGL context is created.
   *
   * Has no effect on a viewport already mounted: `dispose` then `mount` is what applies it.
   */
  configureOutput(output: ViewportOutput): void {
    this.output = output
  }
}
