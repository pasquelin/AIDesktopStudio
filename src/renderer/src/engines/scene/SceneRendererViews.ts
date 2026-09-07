import { type Object3D, type PerspectiveCamera, type Vector3 as ThreeVector3 } from 'three'
import { framingPlacement, isCameraView, viewPosition, type PaneView } from './sceneView'
import { type ViewDirection } from '@shared/domain/scene'
import './bvhPatches'
import { type TransformSpace } from './gizmoTarget'
import { lookedAtBy, DEFAULT_VIEW_DISTANCE, SIDE_VIEW_DISTANCE } from './sceneRendererSupport2'
import { SceneRendererCamera } from './SceneRendererCamera'
export abstract class SceneRendererViews extends SceneRendererCamera {
  protected abstract attachGizmo(): void
  protected abstract redraw(): void
  protected abstract selectedObjects(): Object3D[]
  protected abstract selectionCentre(): ThreeVector3 | null
  protected abstract aimGizmo(): void
  public abstract quadView(): boolean
  protected abstract sceneHeight(): number
  protected abstract cameraObject(cameraNodeId: string | null): PerspectiveCamera | null
  setSpace(space: TransformSpace): void {
    this.space = space
    // Held back mid-drag, like a mode change: `TransformControls` re-aims its interaction plane
    // from `space` every frame, while the start of the gesture was captured on the old one — the
    // object jumps off the axis it was given, and the release writes that jump down.
    if (this.gizmo?.dragging) return
    this.gizmo?.setSpace(space)
    // The pivot carries the frame for a group: re-aimed, or it keeps the last one's orientation.
    this.attachGizmo()
    this.redraw()
  }
  /** Frames whatever is selected, gizmo or not: a mode with no gizmo still has a selection. */
  frameSelection(): void {
    const objects = this.selectedObjects()
    const orbit = this.viewport.orbit
    if (objects.length === 0 || !orbit) return
    const { target, position } = framingPlacement(objects, this.view.fieldOfView)
    orbit.target.copy(target)
    this.viewport.camera.position.copy(position)
    orbit.update()
    // Moving an orthographic camera changes nothing of what it shows: without this, `F` recentred
    // the orbit and left the screen exactly as it was.
    this.viewport.refit()
    this.redraw()
  }
  /**
   * Frames the selection AND keeps it framed, at the angle and the distance the hand chose —
   * Unity's ⇧F. Called again it lets go, the same press that took hold.
   */
  frameFollow(): void {
    if (this.followed) {
      this.followed = null
      return
    }
    this.frameSelection()
    this.followed = this.selectionCentre()
    this.followedIds = this.selectedIds
  }
  /** Carries the view along with what it follows, answering whether anything moved: reporting
   * motion every frame would keep the render loop awake over a still scene. */
  protected followSelection(): boolean {
    const held = this.followed
    const orbit = this.viewport.orbit
    if (!held || !orbit) return false
    // A frame drawn while the graph is being rebuilt reads no object for a node that is still
    // selected. Skipped, never taken as a reason to let go — `apply` alone decides that.
    const centre = this.selectionCentre()
    if (!centre) return false
    // Another body picked is another thing to follow, not a leap to it: seated afresh, the view
    // stays where the hand left it and travels only with what moves from now on.
    if (this.selectedIds !== this.followedIds) {
      this.followed = centre
      this.followedIds = this.selectedIds
      return false
    }
    const shift = centre.sub(held)
    if (shift.lengthSq() === 0) return false
    // Both by the same amount: the angle and the distance are the hand's, and only what is
    // looked AT has moved. `OrbitControls` reads its own spherical off the pair, so it holds.
    this.viewport.camera.position.add(shift)
    orbit.target.add(shift)
    held.add(shift)
    return true
  }
  /** Looks at the scene from one of the six sides, keeping the distance the view already had. */
  viewFrom(direction: ViewDirection): void {
    const orbit = this.viewport.orbit
    if (!orbit) return
    const camera = this.viewport.camera
    // The point LOOKED AT: a side view centred on a pivot the pointer left off the axis swings
    // the camera onto a side of THAT, and `orbit.update()` ends on `lookAt` and keeps it there.
    orbit.target.copy(lookedAtBy(camera, orbit.target))
    const distance = camera.position.distanceTo(orbit.target) || DEFAULT_VIEW_DISTANCE
    const { x, y, z } = viewPosition(direction, orbit.target, distance)
    camera.position.set(x, y, z)
    orbit.update()
    this.redraw()
  }
  /**
   * Four views or one, and where the three added ones stand.
   *
   * The sides are the three a modelling package opens with — down, from the front, from the left
   * — and the main view keeps the corner it was in, gizmo and all. Aimed from here rather than by
   * the viewport: where a camera stands is a question about the scene, and the viewport holds no
   * scene of its own.
   */
  setQuadView(on: boolean): void {
    this.viewport.setLayout(on ? 'quad' : 'single')
    if (!on) {
      this.post?.releaseSurface('pane:1')
      this.post?.releaseSurface('pane:2')
      this.post?.releaseSurface('pane:3')
    }
    if (on) this.placePanes()
    // Now rather than at the next pointer move: the gizmo reads its own events, and one left
    // aimed at a quarter of the canvas answers a click nowhere near the handle it is drawn on.
    this.aimGizmo()
  }
  /**
   * What each view shows: a side, or a camera free to turn.
   *
   * Only a free view orbits. A side view exists BECAUSE it does not turn — a top view one drag
   * away from being an almost-top view answers no question at all — so its rotation is locked
   * while panning and zooming stay: those move where one looks from, never the direction.
   */
  setPaneViews(views: readonly PaneView[]): void {
    this.paneViews = [...views]
    if (this.quadView()) this.placePanes()
  }
  /** One pane: a camera of the document looks through itself, a side view is aimed at `target`. */
  private placePane(index: number, view: PaneView, target: ThreeVector3): void {
    const locked = isCameraView(view) ? this.cameraObject(view.nodeId) : null
    this.viewport.setPaneCamera(index, locked)
    const orbit = this.viewport.paneOrbits[index]
    if (isCameraView(view)) {
      if (orbit) orbit.enableRotate = true
      return
    }
    this.viewport.setPaneProjection(index, view === 'free' ? 'perspective' : 'orthographic')
    const camera = this.viewport.paneCameras[index]
    if (orbit) orbit.enableRotate = view === 'free'
    if (!camera || view === 'free') return
    const { x, y, z } = viewPosition(view, target, SIDE_VIEW_DISTANCE)
    camera.position.set(x, y, z)
    camera.lookAt(target)
    if (orbit) {
      orbit.target.copy(target)
      orbit.update()
    }
  }

  protected placePanes(): void {
    const main = this.viewport.perspective
    const pivot = this.viewport.orbit?.target
    // What the MAIN view looks at, never the raw pivot: the sides would otherwise open centred
    // on a point the pointer left off the axis — see `viewPlacement`, which says why.
    const target = pivot ? lookedAtBy(main, pivot) : this.pivot.position
    this.viewport.setPaneHeight(this.sceneHeight())
    for (const [index, view] of this.paneViews.entries()) this.placePane(index, view, target)
    this.redraw()
  }
}
