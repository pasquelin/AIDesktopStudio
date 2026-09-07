import { Plane, Raycaster, Vector2, Vector3, type Object3D, type PerspectiveCamera } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { dollyTo, notchesOf } from './dolly'
import { gazeTargetOf, onScreen, pivotFor, type PivotMode } from './orbitPivot'
import type { PointerPosition } from './pointer'

const DEFAULT_REACH = 10
const WHEEL_SETTLES_MS = 250
const SETTLED_ONLY: PivotMode = { aroundSelection: false, underCursor: false }
const GROUND = new Plane(new Vector3(0, 1, 0), 0)
const AIM = new Vector3()

export type ViewportNavigationTargetOptions = {
  pointerNdc: (at: PointerPosition) => { x: number; y: number } | null
  pickTargets: () => Object3D[]
  selectionCentre: () => Vector3 | null
  pivotMode: () => PivotMode | undefined
  requestRender: () => void
  onSettled: (pane: number) => void
}

/** Ray target shared by wheel and orbit-pivot navigation, with scratch allocated once. */
export class ViewportNavigationTarget {
  private readonly raycaster = new Raycaster()
  private readonly ndc = new Vector2()
  private wheelAim: { readonly aim: Vector3; readonly aimed: Vector3 } | null = null
  private settling: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: ViewportNavigationTargetOptions) {}

  invalidate(): void {
    this.wheelAim = null
  }

  dispose(): void {
    if (this.settling !== null) clearTimeout(this.settling)
    this.settling = null
    this.wheelAim = null
  }

  wheel(event: WheelEvent, pane: number, camera: PerspectiveCamera, orbit: OrbitControls): boolean {
    const held = this.wheelAim ?? this.aimWheel(event, camera, orbit)
    if (!held) return false
    this.wheelAim = held
    const move = dollyTo({
      position: camera.position,
      aim: held.aim,
      aimed: held.aimed,
      notches: notchesOf(event.deltaY, event.deltaMode),
    })
    camera.position.copy(move.position)
    if (move.pivot) orbit.target.copy(move.pivot)
    else aimPivotAhead(camera, orbit.target)
    this.options.requestRender()
    this.reportSettled(pane)
    if (move.crossed) this.wheelAim = null
    return true
  }

  pivotAt(at: PointerPosition, camera: PerspectiveCamera, orbit: OrbitControls): Vector3 {
    camera.updateMatrixWorld()
    return pivotFor(
      {
        selection: () => this.visibleSelection(camera),
        underCursor: () => this.metByPointer(at, camera, camera.far),
        settled: orbit.target.clone(),
      },
      this.options.pivotMode() ?? SETTLED_ONLY,
    )
  }

  private reportSettled(pane: number): void {
    if (this.settling !== null) clearTimeout(this.settling)
    this.settling = setTimeout(() => {
      this.settling = null
      this.wheelAim = null
      this.wheelAim = null
      this.options.onSettled(pane)
    }, WHEEL_SETTLES_MS)
  }

  private aimWheel(event: WheelEvent, camera: PerspectiveCamera, orbit: OrbitControls) {
    const ndc = this.options.pointerNdc(event)
    if (!ndc) return null
    this.raycaster.setFromCamera(this.ndc.set(ndc.x, ndc.y), camera)
    const reach = camera.position.distanceTo(orbit.target) || DEFAULT_REACH
    return {
      aim: this.raycaster.ray.direction.clone(),
      aimed: this.metByRay(reach) ?? this.raycaster.ray.at(reach, new Vector3()),
    }
  }

  private metByRay(limit: number): Vector3 | null {
    const hit = this.raycaster.intersectObjects(this.options.pickTargets(), true)[0]
    if (hit) return hit.point
    const ground = this.raycaster.ray.intersectPlane(GROUND, new Vector3())
    return ground && this.raycaster.ray.origin.distanceTo(ground) <= limit ? ground : null
  }

  private metByPointer(
    at: PointerPosition,
    camera: PerspectiveCamera,
    limit: number,
  ): Vector3 | null {
    const ndc = this.options.pointerNdc(at)
    if (!ndc) return null
    this.raycaster.setFromCamera(this.ndc.set(ndc.x, ndc.y), camera)
    return this.metByRay(limit)
  }

  private visibleSelection(camera: PerspectiveCamera): Vector3 | null {
    const centre = this.options.selectionCentre()
    return centre && onScreen(centre.clone().project(camera)) ? centre : null
  }
}

function aimPivotAhead(camera: PerspectiveCamera, pivot: Vector3): void {
  pivot.copy(gazeTargetOf(camera.position, camera.getWorldDirection(AIM), pivot))
}
