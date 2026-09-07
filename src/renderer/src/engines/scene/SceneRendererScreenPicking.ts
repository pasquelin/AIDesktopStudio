import { type Intersection, type Camera, type Object3D } from 'three'
import {
  boxBetween,
  frontmostSegmentIn,
  idsTouching,
  boxAround,
  type ScreenBody,
} from './marqueeSelection'
import { screenScale } from '../viewport/screenScale'
import { PATH_SAMPLES, segmentAt } from './cameraPath'
import { railOf } from './nodeRail'
import { handlePartOf, knobIndexOf, PATH_CURVE_NAME } from './threeFactory'
import { nearestProjected } from './bonePicking'
import './bvhPatches'
import { extendsSelection, worldRadiusOf } from './sceneRendererSupport1'
import type { Marquee } from './sceneRendererSupport1'
import {
  BODY_CENTRE,
  BODY_EDGE,
  BODY_RIGHT,
  BODY_UP,
  BODY_ABOVE,
  RAIL_SPOT,
  withHeldFuzz,
  LINE_GRAB,
  KNOB_REACH,
} from './sceneRendererSupport2'
import type { ProjectedKnob, PickedPathPoint } from './sceneRendererSupport2'
import { SceneRendererMarquee } from './SceneRendererMarquee'

export abstract class SceneRendererScreenPicking extends SceneRendererMarquee {
  /** What the rectangle took, against the camera of the pane it was DRAWN in — a hand that ended
   * up in another pane is still selecting in the first. */
  protected pickInMarquee(marquee: Marquee, event: PointerEvent): void {
    const from = this.viewport.pointerNdcOf(marquee.from, marquee.pane)
    const to = this.viewport.pointerNdcOf(marquee.to, marquee.pane)
    if (!from || !to) return

    const camera = this.viewport.paneCameras[marquee.pane] ?? this.viewport.camera
    const box = boxBetween(from, to)

    // In pose mode the rectangle names a BONE and never a node, exactly as a click does there.
    if (this.poseMode) {
      const picked = frontmostSegmentIn(this.projectedSegments(camera), box)
      this.options.onSelectBone?.(picked ? { nodeId: picked.nodeId, bone: picked.bone } : null)
      return
    }

    const taken = idsTouching(box, this.screenBodies(camera))
    // ADDS where a click toggles: a rectangle drawn over what is already picked must not take it
    // back off, or a second sweep would undo the first.
    const kept = extendsSelection(event) ? this.selectedIds : []
    this.options.onSelect([...kept, ...taken], 'replace')
    // Whatever was picked before belongs to a rail that may no longer be the selection.
    if (this.pickedPathPoint) this.options.onSelectPathPoint?.(null)
  }

  /** Every node as one pane's camera sees it, in device coordinates: its origin plus whatever
   * its own geometry spans — see `worldRadiusOf`, and why a group spans nothing. */
  protected screenBodies(camera: Camera): ScreenBody[] {
    // Both readings below go through the camera's world matrix, and a pane whose view moved since
    // the last frame drew still carries that frame's — the same reading `pivotAt` makes.
    camera.updateMatrixWorld()
    BODY_RIGHT.setFromMatrixColumn(camera.matrixWorld, 0)
    BODY_UP.setFromMatrixColumn(camera.matrixWorld, 1)

    const bodies: ScreenBody[] = []
    for (const [id, object] of this.objects) {
      if (!shownInWorld(object)) continue

      object.getWorldPosition(BODY_CENTRE)
      // `project` flips the sign behind the camera, so a body at one's back would fall in the box
      // as surely as one in front of it.
      if (BODY_EDGE.copy(BODY_CENTRE).applyMatrix4(camera.matrixWorldInverse).z >= 0) continue

      const reach = worldRadiusOf(object)
      BODY_EDGE.copy(BODY_CENTRE).addScaledVector(BODY_RIGHT, reach)
      BODY_ABOVE.copy(BODY_CENTRE).addScaledVector(BODY_UP, reach)
      BODY_CENTRE.project(camera)
      BODY_EDGE.project(camera)
      BODY_ABOVE.project(camera)
      // Both axes: a pane is wider than it is tall, and the same reach spans more of the height
      // than of the width — one radius for both missed the top third of every cube on a 16:9.
      bodies.push({
        id,
        box: boxAround(
          BODY_CENTRE,
          Math.abs(BODY_EDGE.x - BODY_CENTRE.x),
          Math.abs(BODY_ABOVE.y - BODY_CENTRE.y),
        ),
      })
    }

    return bodies
  }

  /**
   * The control point the pointer is over, on a rail being WORKED ON — otherwise the knobs of
   * every rail would take clicks meant for what stands behind them.
   *
   * On the SCREEN rather than through a ray, for the reason `nearestProjected` carries: a knob
   * keeps its size on screen, and its world radius is whatever the last camera to draw it left
   * behind. A ray answered with that one, so in a quad view a knob could be unreachable where it
   * was plainly visible. It also settles what a ray never could — the curve lies right across
   * its own control points, so the nearest INTERSECTION was often the line.
   */
  protected pathPointAt(event: PointerEvent): PickedPathPoint | null {
    const ndc = this.viewport.pointerNdcOf(event)
    if (!ndc) return null

    const picked = nearestProjected(
      this.projectedKnobs(this.cameraInHand()),
      { x: ndc.x, y: ndc.y },
      KNOB_REACH,
    )
    return picked ? { nodeId: picked.nodeId, index: picked.index, part: picked.part } : null
  }

  /** Every knob of every rail being worked on, as the screen sees it. */
  protected projectedKnobs(camera: Camera): ProjectedKnob[] {
    const projected: ProjectedKnob[] = []

    for (const rail of this.workedRails()) {
      for (const knob of rail.children) {
        // A tangent is only pickable while it SHOWS, which is while its anchor is the one held:
        // hidden ones would take clicks meant for the surface behind them.
        const handle = knob.visible ? handlePartOf(knob.name) : null
        const index = handle?.index ?? knobIndexOf(knob.name)
        if (index === null) continue

        knob.getWorldPosition(RAIL_SPOT)
        RAIL_SPOT.project(camera)
        projected.push({
          nodeId: rail.name,
          index,
          part: handle?.part,
          x: RAIL_SPOT.x,
          y: RAIL_SPOT.y,
          z: RAIL_SPOT.z,
        })
      }
    }

    return projected
  }

  /**
   * The stretch of rail the pointer is over, as an index into its control points: the point a
   * click poses goes right after it.
   *
   * The line is sampled by arc length, so the vertex three hands back IS an abscissa — which is
   * what `segmentAt` converts back into a stretch. Knobs are picked on the screen instead, so a
   * ray is now cast for the CURVE alone.
   *
   * The grab around that curve is set per rail and never left at three's own: its default is one
   * WORLD UNIT, which on a rail five units long is a tube wide enough to swallow clicks meant for
   * whatever stands beside it — and ⌥ writes a point into the document. Put back afterwards, the
   * raycaster being the one every other pick goes through: a light is picked by the LINES of its
   * helper. Measured from the rail's own origin rather than from where the ray lands, the point
   * not being known before the hit.
   */
  protected pathSegmentAt(event: PointerEvent): { nodeId: string; index: number } | null {
    const ndc = this.viewport.pointerNdcOf(event)
    if (!ndc) return null

    this.pointer.set(ndc.x, ndc.y)
    const camera = this.cameraInHand()
    this.raycaster.setFromCamera(this.pointer, camera)

    const nearest = withHeldFuzz(this.raycaster, () => {
      let found: Intersection | null = null

      for (const rail of this.workedRails()) {
        this.raycaster.params.Line.threshold = screenScale(
          camera,
          rail.getWorldPosition(RAIL_SPOT),
          LINE_GRAB,
        )
        for (const hit of this.raycaster.intersectObject(rail, true)) {
          if (hit.object.name !== PATH_CURVE_NAME || hit.index === undefined) continue
          if (!found || hit.distance < found.distance) found = hit
        }
      }

      return found
    })
    if (!nearest || nearest.index === undefined) return null

    const nodeId = nearest.object.parent?.name
    const rail = nodeId ? railOf(this.applied.get(nodeId)) : null
    if (!nodeId || !rail) return null

    // The MIDDLE of the sample three hands back: `index` names where the segment starts, so
    // reading it straight puts a click in the last sixty-fourth before a control point into the
    // stretch before it.
    return { nodeId, index: segmentAt(rail, (nearest.index + 0.5) / PATH_SAMPLES) }
  }
}

function shownInWorld(object: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false
  }
  return true
}
