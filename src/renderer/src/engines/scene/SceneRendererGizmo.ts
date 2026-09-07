import { Mesh, type Object3D } from 'three'
import type { TransformControls } from 'three/addons/controls/TransformControls.js'
import { type Transform } from '@shared/domain/scene'
import { withMovedHandle, withMovedPoint } from './cameraPath'
import { railOf } from './nodeRail'
import { type RailColours } from './threeFactory'
import { wearGeometry, applyPath, tiledGeometry } from './threeSync'
import { applyTransform, carry, placePivot, transformOf } from './pivot'
import { plainVector } from './sceneView'
import { restWithin } from '@/engines/character/boneRest'
import './bvhPatches'
import { gizmoTargetFor } from './gizmoTarget'
import {
  JOINT_WANTED,
  JOINT_RESTED,
  JOINT_PIVOT,
  JOINT_TURN,
  JOINT_FRAME,
  JOINT_LOCAL,
} from './sceneRendererSupport2'
import { SceneRendererHierarchy } from './SceneRendererHierarchy'
export abstract class SceneRendererGizmo extends SceneRendererHierarchy {
  protected abstract pickedBoneObject(): Object3D | null
  protected abstract articulates(bone: Object3D): boolean
  protected abstract pickedKnob(): Object3D | null
  /**
   * A picked bone is what the gizmo holds while the pose mode is on, and it is attached directly:
   * a bone is inside a model's instance, so the pivot has nothing to carry.
   */
  private attachToBone(gizmo: TransformControls, boneObject: Object3D): void {
    this.boneHandle = this.articulates(boneObject)
    if (this.mode === 'select') {
      gizmo.detach()
      return
    }
    if (!this.boneHandle) {
      gizmo.attach(boneObject)
      return
    }
    // 🛑 OUT of the chain: the gizmo attached to the joint itself has the bone it turns for a
    // parent, so its own frame swung under the hand and the drag ran away.
    boneObject.getWorldPosition(this.pivot.position)
    this.pivot.quaternion.identity()
    this.pivot.scale.set(1, 1, 1)
    gizmo.attach(this.pivot)
  }

  protected attachGizmo(): void {
    const gizmo = this.gizmo
    if (!gizmo) return
    if (this.sculptMode) {
      gizmo.detach()
      return
    }
    // Nothing is re-aimed mid-gesture. Detaching would swallow the `mouseUp` that hands the
    // selection back to the scene, and re-centring the pivot while it carries that selection
    // would drag it to the origin — a mode key pressed during a drag must not move anything.
    if (gizmo.dragging) return
    const boneObject = this.pickedBoneObject()
    if (boneObject) return this.attachToBone(gizmo, boneObject)
    this.boneHandle = false
    const knob = this.pickedKnob()
    if (knob) {
      // 🛑 A point is a POSITION, so holding one IS a translation whatever tool is armed: rotating
      // or scaling would ask the gizmo to write what the descriptor has no room for, and leaving
      // it detached made a handle one takes and cannot move — which reads as a dead handle.
      gizmo.setMode('translate')
      gizmo.attach(knob)
      return
    }
    // Back to the armed tool: holding a point forced translation, and a rotate left behind would
    // outlive the point that asked for it.
    if (this.mode !== 'select') gizmo.setMode(this.mode)
    const target = gizmoTargetFor(this.mode, this.space, this.selectedObjects(), object =>
      this.applied.get(object.name),
    )
    if (target.kind === 'none') {
      gizmo.detach()
      return
    }
    if (target.kind === 'object') {
      gizmo.attach(target.object)
      return
    }
    placePivot(this.pivot, target.objects, target.anchor)
    gizmo.attach(this.pivot)
  }
  protected onGizmoGrab = (): void => {
    this.dragged = false
    if (this.gizmo?.object !== this.pivot || this.boneHandle) return
    carry(this.pivot, this.selectedObjects(), this.viewport.scene)
  }
  protected onGizmoChange = (): void => {
    this.dragged = true
    this.holdDraggedBone()
    this.layOnSurface()
    // A box that stayed behind while its object moved is a box that says nothing. Re-reading a
    // bounding box is cheap — building one is not, which is why this is not `refreshAids`.
    this.aids.refreshBoxes()
    // The move is only reported on release, so an instanced node would stand where the last
    // grouping left it for the whole gesture. `TransformControls` has already written the world
    // matrices this reads. The moved slots alone, never a regrouping: that costs 47.5 ms on
    // 40 000 nodes, which per pointer move is three dropped frames.
    this.writeMovedSlots(this.descendantsOf(this.selectedIds))
    this.previewRail()
    this.redraw()
  }
  /** The three tokens a rail is dressed in — see `RailColours`. */
  protected railColours(): RailColours {
    return { knob: this.meshColor, handle: this.handleColor, start: this.startColor }
  }
  /**
   * The joint the gizmo carries, brought back within its holds EVERY frame: held on release
   * alone, a bone left the body as a long spike for the whole gesture. Seen on screen 2026-09-02.
   */
  protected holdDraggedBone(): void {
    const picked = this.pickedBone
    const bone = this.pickedBoneObject()
    if (!picked || !bone) return
    const rest = this.rigRests.get(picked.nodeId)?.get(picked.bone)
    if (!rest) return
    // Posing ARTICULATES; editing a rest PLACES. Translating the joint alone left every bone at
    // zero rotation, so the limb never turned and its skin stretched after the hand instead.
    if (this.boneHandle) {
      this.articulateTowards(bone, rest)
      return
    }
    // Posing turns a bone on itself and moves nothing: there is no distance to hold.
    if (!this.restEditing) return
    applyTransform(bone, restWithin(rest, transformOf(bone), this.heldBoneAxes))
  }
  /**
   * The bone ARRIVING at a dragged joint, turned so the joint lands where the hand asked — and
   * the joint put back on the end of it, which is what keeps the limb rigid and its skin whole.
   */
  protected articulateTowards(bone: Object3D, rest: Transform): void {
    const parent = bone.parent
    if (!parent) return
    JOINT_WANTED.copy(this.pivot.position)
    bone.position.set(rest.position.x, rest.position.y, rest.position.z)
    parent.updateMatrixWorld(true)
    bone.getWorldPosition(JOINT_RESTED)
    parent.getWorldPosition(JOINT_PIVOT)
    JOINT_RESTED.sub(JOINT_PIVOT)
    JOINT_WANTED.sub(JOINT_PIVOT)
    if (JOINT_RESTED.lengthSq() === 0 || JOINT_WANTED.lengthSq() === 0) return
    JOINT_TURN.setFromUnitVectors(JOINT_RESTED.normalize(), JOINT_WANTED.normalize())
    // The turn was measured in the world; a local quaternion is written in the GRANDPARENT's.
    if (parent.parent) parent.parent.getWorldQuaternion(JOINT_FRAME)
    else JOINT_FRAME.identity()
    JOINT_LOCAL.copy(JOINT_FRAME).invert().multiply(JOINT_TURN).multiply(JOINT_FRAME)
    parent.quaternion.premultiply(JOINT_LOCAL)
    parent.updateMatrixWorld(true)
    // Back onto the joint before the frame is drawn: a handle left where the pointer went floats
    // off the body whenever the bone cannot reach that far. `TransformControls` measures the next
    // move from its own start, so this costs the gesture nothing.
    bone.getWorldPosition(this.pivot.position)
  }
  /**
   * 🛑 The command lands on RELEASE — one drag, one undo — so nothing else shows the curve
   * following: a band is swept along its rail, and the knob alone left the surface behind.
   */
  protected previewRail(): void {
    const picked = this.pickedPathPoint
    const knob = this.pickedKnob()
    const node = picked ? this.applied.get(picked.nodeId) : undefined
    const rail = railOf(node)
    const object = picked ? this.objects.get(picked.nodeId) : undefined
    if (!picked || !knob || !node || !rail || !object) return
    const at = plainVector(knob.position)
    const next = picked.part
      ? withMovedHandle(rail, picked.index, picked.part, at)
      : withMovedPoint(rail, picked.index, at)
    applyPath(object, next, this.meshColor)
    if (node.type !== 'mesh' || node.geometry.kind !== 'ribbon' || !(object instanceof Mesh)) return
    // 🛑 Built OUTSIDE the shared cache: the recipe differs at every pointer move, so its key
    // never hits — the entry is minted and dropped in the same frame, `stableKey` costing 0,075 ms
    // for nothing. `freeGeometry` tells the three provenances apart and disposes this one.
    const worn = wearGeometry(
      object,
      tiledGeometry({ ...node.geometry, path: next }, node.material.tilesPerMetre),
    )
    if (worn) this.freeGeometry(worn)
    this.previewedRail = node.id
  }
}
