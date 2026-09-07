import { type Vector3 } from 'three'
import type { Vector3 as PlainVector3 } from '@shared/domain/scene'
import { railOf } from './nodeRail'
import { spotOnRay } from './railSpot'
import { directionOf, plainVector } from './sceneView'
import './bvhPatches'
import {
  lookedAtBy,
  RAIL_ANCHOR,
  RAIL_FACING,
  withHeldFuzz,
  isScenery,
  DEFAULT_VIEW_DISTANCE,
  HELPER_SETTLES,
  nodeIdOf,
} from './sceneRendererSupport2'
import { SceneRendererScreenPicking } from './SceneRendererScreenPicking'

export abstract class SceneRendererPicking extends SceneRendererScreenPicking {
  /**
   * Where a click lands on the ONE rail being worked on, in that rail's own frame.
   *
   * Nothing for a pointer with two rails under it: extending whichever came first would pose a
   * point on a rail nobody aimed at, and a gesture repeated ten times would scatter half of them.
   */
  protected railSpotAt(event: PointerEvent): { nodeId: string; point: PlainVector3 } | null {
    const worked = this.workedRailIds()
    if (worked.size !== 1) return null

    const [nodeId] = [...worked]
    const ndc = this.viewport.pointerNdcOf(event)
    if (!nodeId || !ndc) return null

    const rail = this.objects.get(nodeId)
    // The LAST anchor is only where the plane stands: on a closed run the point still lands in
    // the span it falls in — see `withPointAppended`.
    const anchor = railOf(this.applied.get(nodeId))?.points.at(-1)
    if (!rail || !anchor) return null

    const camera = this.cameraInHand()
    this.pointer.set(ndc.x, ndc.y)
    this.raycaster.setFromCamera(this.pointer, camera)

    // Up the chain, not down it: a rail parented to a group reads its own placement off that
    // group's matrix, and `updateMatrixWorld` would compose against whatever it last held.
    rail.updateWorldMatrix(true, false)
    RAIL_ANCHOR.copy(anchor)
    const spot =
      this.sceneryUnder() ??
      spotOnRay(
        this.raycaster.ray,
        rail.localToWorld(RAIL_ANCHOR),
        camera.getWorldDirection(RAIL_FACING),
      )
    if (!spot) return null

    return { nodeId, point: plainVector(rail.worldToLocal(spot)) }
  }

  /**
   * What the RAY IN HAND meets of the scenery — `railSpotAt` casts it. Nearest first, and the
   * nearest that a document point may sit ON: see `isScenery` for the three it walks past.
   *
   * No fuzz on lines or clouds either: a point aimed into the void must not land on the edges
   * hung under a camera as though they were a surface.
   */
  protected sceneryUnder(): Vector3 | null {
    const hits = withHeldFuzz(this.raycaster, () => {
      this.raycaster.params.Line.threshold = 0
      this.raycaster.params.Points.threshold = 0
      return this.raycaster.intersectObjects([...this.objects.values()], true)
    })

    return (
      hits.find(hit => isScenery(hit.object, id => this.applied.get(id)?.type === 'path'))?.point ??
      null
    )
  }

  /** The node the pointer is over, or nothing for a ray that met only the void. */
  protected nodeAt(event: PointerEvent): string | null {
    const ndc = this.viewport.pointerNdcOf(event)
    if (!ndc) return null

    this.pointer.set(ndc.x, ndc.y)
    // The camera of the view under the pointer, never the main one: a ray cast from elsewhere
    // meets whatever stands in ITS way, so a click in a side view picked something the pointer
    // was nowhere near — which made every view but the first one inert.
    this.raycaster.setFromCamera(this.pointer, this.cameraInHand())

    // Helpers are what makes a light clickable, and recursively: it is one of their children
    // that the ray actually meets. Both they and the light carry the node's id. Only the ones on
    // SCREEN: three's raycaster does not read `visible`, so a hidden helper would go on catching
    // clicks over empty space and selecting a lamp nobody could see.
    const targets = [
      ...[...this.objects.values()].filter(object => !this.instances.holdsSource(object)),
      ...this.instances.editorPickable(),
      ...[...this.helpers.values()].filter(helper => helper.visible),
    ]
    const hit = this.raycaster.intersectObjects(targets, true)[0]
    if (!hit) return null
    return this.instances.nodeIdOf(hit) ?? nodeIdOf(hit.object, name => this.objects.has(name))
  }

  /**
   * The side the trihedron was clicked on, gone to through `viewFrom`. Answers whether the click
   * was its, so the viewport can leave it alone.
   *
   * The helper moves the camera itself, around a centre of its own that `OrbitControls` knows
   * nothing about: left to it, the orbit's target would drift and the first drag afterwards would
   * swing the view somewhere nobody asked for. So its centre is put on the target, its animation
   * is run out in one step — only to learn which side it aimed at — and the move is left to
   * `viewFrom`, which keeps the distance, nudges the poles off axis and tells the controls.
   */
  protected turnToViewHelper(event: PointerEvent): boolean {
    const helper = this.viewHelper
    const orbit = this.viewport.orbit
    if (!helper || !orbit) return false

    const camera = this.viewport.camera
    const from = camera.position.clone()
    const facing = camera.quaternion.clone()

    // The point LOOKED AT, never the raw pivot: off the axis it would name a side of the pivot
    // rather than the side of the view, and `viewFrom` would send the camera there.
    const looked = lookedAtBy(camera, orbit.target)
    helper.center.copy(looked)
    // The helper reads where the camera stands to work out where it would send it, and one
    // sitting exactly on its target stands nowhere: every side would come back as the same
    // point. Pushed off first, and put back below whatever the click turns out to be.
    if (from.equals(looked)) camera.position.z += DEFAULT_VIEW_DISTANCE

    const hit = helper.handleClick(event)
    if (hit) helper.update(HELPER_SETTLES)
    const direction = hit ? directionOf(camera.position.clone().sub(looked)) : null

    // Put back everything the helper moved. It was only ever asked which side it aimed at; the
    // move itself belongs to `viewFrom`, which reads the distance off the camera it is about to
    // move and tells the controls once it has.
    camera.position.copy(from)
    camera.quaternion.copy(facing)
    if (direction) this.viewFrom(direction)

    return hit
  }

  // Without this the OS menu opens on the very gesture that starts flying.
  protected onContextMenu = (event: Event): void => event.preventDefault()

  /**
   * On the way IN to an axis, never on the way back to `null`: there is no plane to turn once
   * nothing is held, and this fires on both edges — half the walks would be for no one.
   */
  protected onGizmoAxisChanged = (): void => {
    if (this.gizmo?.axis) this.refreshGizmoMatrices()
  }

  // No need for the event's own value: three writes the property before it dispatches.
  protected onDraggingChanged = (): void => {
    // A handle taken under the left button ends the flight that button armed: dragging a gizmo
    // and flying at once would move the camera and the object on one gesture.
    if (this.gizmo?.dragging === true) {
      // Before the branch below, and outside it: a surface snap composes its turn onto this one
      // every frame, so it has to be the one the gesture STARTED on whether or not a flight was
      // running.
      if (this.gizmo?.object) this.surfaceHeld.copy(this.gizmo.object.quaternion)
      if (this.flownWith === 0) {
        this.flownFrom = null
        this.flownWith = null
      }
      // Outside the branch, and for every scheme: a handle GRABBED must stop the camera, or one
      // gesture moves the object and the point of view at once — which is what this exists for.
      // A permanent flight is no exception; only a click that grabs nothing leaves the keys be.
      if (!this.navigating) this.held.clear()
    }
    this.syncPaneFreeze()
  }
}
