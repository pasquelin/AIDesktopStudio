import { Mesh, type Object3D } from 'three'
import { customFrom, schemeFor } from '@shared/domain/navigationPreset'
import { type AidPalette } from './viewportAids'
import type { Vector3 as TurnedVector } from '@shared/domain/transform'
import { pixelRatioFor, shadowMapSizeFor } from './viewportQuality'
import { applyShadowQuality, applyShadows } from './shadows'
import './bvhPatches'
import { heldBy, surfaceLift, surfaceRayFrom, surfaceTurn } from './surfaceSnap'
import type { ViewportOptions } from './sceneRendererSupport1'
import {
  DOWNWARD,
  SURFACE_NORMAL,
  isScenery,
  aidsMoved,
  helperVisibilityMoved,
  FACING,
  FACED,
} from './sceneRendererSupport2'
import { SceneRendererValidation } from './SceneRendererValidation'
export abstract class SceneRendererAids extends SceneRendererValidation {
  protected abstract applySnap(): void
  protected abstract applyGizmoSize(): void
  protected abstract tuneShadows(): void
  protected abstract applyPalette(): void
  /**
   * The viewport settings changed. The grid is rebuilt rather than resized — `GridHelper` bakes
   * its geometry at construction — and the camera's projection matrix has to be recomputed by
   * hand, since three.js never reads `fov` back on its own.
   */
  configure(next: ViewportOptions): void {
    const held = this.view
    const gridMoved = next.showGrid !== held.showGrid || next.gridSize !== held.gridSize
    const lensMoved = next.fieldOfView !== held.fieldOfView
    const configureStep1 = () => {
      const configureStep1 = () => {
        // The cap moves the size a light is actually given, so a quality change resizes maps too.
        const shadowsResized =
          shadowMapSizeFor(next.quality, next.shadowMapSize) !==
          shadowMapSizeFor(held.quality, held.shadowMapSize)
        const shadowsMoved =
          shadowsResized ||
          next.shadowQuality !== held.shadowQuality ||
          next.shadows !== held.shadows
        // A preference the user just edited wins over whatever the wheel left behind, and only then:
        // dropped on every configure, an unrelated setting would reset a speed mid-flight.
        if (next.flySpeed !== held.flySpeed) {
          this.sessionFlySpeed = null
          // Or the overlay goes on showing what the wheel last produced while the camera flies at
          // the figure the person just typed.
          this.options.onFlySpeedChange?.(next.flySpeed)
        }
        const configureStep2 = () => {
          this.view = next
          this.scheme = schemeFor(next.navigationPreset, customFrom(next))
          // Through the viewport rather than onto the camera: the orthographic frustum is derived
          // from this very field of view, and has to be resized with it.
          if (lensMoved) this.viewport.setFieldOfView(this.drivenLens ?? next.fieldOfView)
          const configureStep3 = () => {
            // Unconditional, both of them: a step changed while snapping is off has to be waiting when
            // it comes on, and the handles are rebuilt from `size` on the frame after it moves.
            this.applySnap()
            this.applyGizmoSize()
            const gl = this.viewport.gl
            const configureStep4 = () => {
              if (gl) {
                applyShadowQuality(gl, next.shadowQuality)
                applyShadows(gl, next.shadows, this.viewport.scene)
              }
              this.viewport.setPixelRatio(pixelRatioFor(next.quality))
              // Every light, not only the ones built after the change: a map is allocated per light, and
              // the grid is the floor under the reach a directional one is given.
              if (shadowsResized || gridMoved) this.tuneShadows()
              const configureStep5 = () => {
                if (gridMoved && this.viewport.canvas) this.applyPalette()
                if (aidsMoved(held, next)) this.refreshAids()
                if (helperVisibilityMoved(held, next)) this.showAidsForSelection()
                const configureStep6 = () => {
                  if (next.stats !== held.stats) this.reportStats()
                  if (gridMoved || lensMoved || shadowsMoved) this.redraw()
                }
                return configureStep6()
              }
              return configureStep5()
            }
            return configureStep4()
          }
          return configureStep3()
        }
        return configureStep2()
      }
      return configureStep1()
    }
    return configureStep1()
  }
  /** How a node is turned, in world — what an arm reading a rotation hangs behind. */
  protected facingOf(id: string): TurnedVector | null {
    const object = this.objects.get(id)
    if (!object) return null
    object.updateWorldMatrix(true, false)
    FACING.setFromQuaternion(object.getWorldQuaternion(FACED))
    return { x: FACING.x, y: FACING.y, z: FACING.z }
  }
  protected aidPalette(): AidPalette {
    const accent = this.viewport.paletteToken('--color-accent')
    return (this.aidPaletteHeld ??= {
      box: accent,
      origin: this.viewport.paletteToken('--color-muted'),
      normal: accent,
      body: accent,
      // 🛑 The one aid with a colour of its OWN, and Alban's call: an arm painted like the rest
      // was read as scenery. Red says « this camera watches THAT body », and nothing else does.
      arm: this.viewport.paletteToken('--color-danger'),
    })
  }
  /**
   * The boxes, origins and normals, rebuilt from what is on stage and what the settings ask for.
   *
   * Called from `apply`, which runs on every state change — a selection, a frame of a slider
   * drag. Nothing asked for and nothing drawn is the ordinary case and has to cost nothing.
   */
  protected refreshAids(): void {
    const wants =
      this.view.boundingBoxes !== 'off' ||
      this.view.origins ||
      this.view.normals ||
      this.rigs.bodies.size > 0 ||
      this.rigs.arms.size > 0 ||
      !this.aids.idle()
    if (!wants) return
    // Every node when the boxes are drawn on all of them, the selection alone otherwise: that is
    // exactly the set `showsAid` reads a box off, and hanging more would be a walk for nothing.
    const aided = this.view.boundingBoxes === 'all' ? this.objects.keys() : this.selectedIds
    this.withHungUnder(aided, () =>
      this.aids.apply(this.objects, this.selectedIds, this.view, this.aidPalette(), this.rigs),
    )
    this.redraw()
  }
  /**
   * Lays what is dragged onto whatever is under it, once per frame of the gesture.
   *
   * Recomputed from the drag's own start each time rather than added to the last result:
   * `TransformControls` rewrites the pivot from `_positionStart` on every move, so a correction
   * folded into the previous one would drift for as long as the gesture lasts.
   */
  protected layOnSurface(): void {
    // What the GIZMO holds, never the pivot: a lone selection attaches straight to its object and
    // leaves the pivot empty — `gizmoTargetFor` routes only two nodes and up through it. Read from
    // the pivot, the snap did nothing at all on one object, which is its main use.
    const held = this.gizmo?.object
    if (!this.snapping.surface || this.mode !== 'translate' || !held) return
    const aligning = this.view.snapSurfaceAlign
    if (aligning) held.quaternion.copy(this.surfaceHeld)
    held.updateMatrixWorld(true)
    this.withHungUnder(this.selectedIds, () => this.surfaceBox.setFromObject(held))
    if (this.surfaceBox.isEmpty()) return
    this.surfaceRay.set(surfaceRayFrom(this.surfaceBox, this.surfaceFrom), DOWNWARD)
    const hit = this.surfaceRay
      .intersectObjects(this.surfaceRoots(), true)
      .find(candidate => this.landsOn(candidate.object, held))
    if (!hit) return
    // Measured AFTER the turn: an object tipped onto a slope has a new lowest point, and lifting
    // it by the one it had upright buries whichever corner the rotation just brought down.
    if (aligning && hit.normal) {
      surfaceTurn(
        this.surfaceNormal
          .copy(hit.normal)
          .applyMatrix3(SURFACE_NORMAL.getNormalMatrix(hit.object.matrixWorld)),
        this.surfaceHeld,
        held.quaternion,
      )
      held.updateMatrixWorld(true)
      this.withHungUnder(this.selectedIds, () => this.surfaceBox.setFromObject(held))
    }
    held.position.y += surfaceLift(this.surfaceBox.min.y, hit.point.y, this.view.snapSurfaceOffset)
    held.updateMatrixWorld(true)
  }
  /**
   * Where the ray starts looking. The ROOTS alone: `this.objects` holds parents AND descendants,
   * so handing it every one makes a node at depth *d* intersect *d+1* times.
   *
   * Written into a kept array rather than built: this answers once per frame of a drag, and the
   * spread alone allocated a second list the size of the scene each time.
   */
  protected surfaceRoots(): Object3D[] {
    this.surfaceScope.length = 0
    for (const object of this.objects.values()) {
      // A body held out of the walk is reached from no root at all, so it is one: a floor of
      // sixteen identical tiles inside a group would otherwise stop being a surface to land on.
      if (object.parent === this.viewport.scene || this.instances.holdsSource(object)) {
        this.surfaceScope.push(object)
      }
    }
    return this.surfaceScope
  }
  /**
   * Whether something the ray met is a surface to rest on: a `Mesh` and nothing else — a rail is
   * a `Line` and its knobs are spheres, neither of which is ground — never what is being dragged,
   * and never scenery the picker already refuses. Landing on a wall somebody isolated away is the
   * same defect as picking one.
   */
  protected landsOn(object: Object3D, held: Object3D): boolean {
    if (!(object instanceof Mesh) || heldBy(object, held)) return false
    return isScenery(object, id => this.applied.get(id)?.type === 'path')
  }
}
