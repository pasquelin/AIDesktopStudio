import { Mesh, type Object3D } from 'three'
import { type Transform } from '@shared/domain/scene'
import { type NodeMove } from './sceneState'
import { handleName, knobName } from './threeFactory'
import { wearGeometry } from './threeSync'
import { applyTransform, release, transformOf } from './pivot'
import { isCameraView, plainVector } from './sceneView'
import { type BoneAxis } from '@/engines/character/boneRest'
import './bvhPatches'
import type { PickedPathPoint } from './sceneRendererSupport2'
import { SceneRendererGizmo } from './SceneRendererGizmo'

export abstract class SceneRendererPose extends SceneRendererGizmo {
  protected abstract resync(moves: readonly NodeMove[]): void

  /**
   * 🛑 The shape a drag built handed back to the one the DOCUMENT says. A gesture that ends
   * without reporting — a point let go of, a key pressed mid-drag — would otherwise leave the
   * band wearing a preview nothing ever replaces, and the screen would quietly lie.
   */
  protected restorePreviewedRail(): void {
    const id = this.previewedRail
    this.previewedRail = null
    if (!id) return

    const node = this.applied.get(id)
    const object = this.objects.get(id)
    if (node?.type !== 'mesh' || !(object instanceof Mesh)) return

    const worn = wearGeometry(
      object,
      this.shapes.acquire(node.geometry, node.material.tilesPerMetre),
    )
    if (worn) this.freeGeometry(worn)
  }

  /**
   * The move is reported once the gesture ends, not on every frame of it: one drag must cost one
   * undo, and the meshes already show the truth while the gizmo holds them.
   */
  protected onGizmoRelease = (): void => {
    const moves = release(this.pivot, this.viewport.scene, id => this.parentObjectOf(id))
    // What a key pressed mid-drag asked for, applied now that the gesture is over.
    this.gizmo?.setSpace(this.space)

    // A click that armed an axis without moving it still round-tripped every carried node
    // through a matrix decomposition, which does not always give the same Euler back — and a
    // negative scale never does. Nothing is reported; the objects are put back from the state.
    if (!this.dragged) {
      if (moves) this.resync(moves)
      return
    }

    if (moves) {
      this.options.onTransform(moves)
      return
    }

    const point = this.pickedPathPoint
    const knob = this.pickedKnob()
    // Before the report: the command that follows re-reads the document, and a preview left
    // mounted would be what the next comparison finds instead of what the document holds.
    this.restorePreviewedRail()
    if (point && knob) {
      // The knob's own position IS the control point: both live in the rail's frame.
      this.options.onPathPoint?.(point, plainVector(knob.position))
      return
    }

    const picked = this.pickedBone
    const boneObject = this.pickedBoneObject()
    if (picked && boneObject) {
      const rest = this.boneRestOf(picked.nodeId, picked.bone, boneObject)
      this.options.onTransform([
        { id: picked.nodeId, bone: picked.bone, rest, transform: transformOf(boneObject) },
      ])
      // The handle stayed where the pointer let it go, which is not where the joint landed.
      this.attachGizmo()
      return
    }

    const target = this.gizmo?.object
    if (target) this.options.onTransform([{ id: target.name, transform: transformOf(target) }])
  }

  /**
   * Whether dragging this joint TURNS the bone arriving at it rather than placing the joint.
   *
   * Posing articulates and never translates, so a bone keeps its length by construction. Turning
   * the joint on itself is the other verb, and it needs no stand-in.
   */
  protected articulates(bone: Object3D): boolean {
    return !this.restEditing && this.mode === 'translate' && bone.parent !== null
  }

  /** The three object of the bone the pose mode picked, while one is picked and still on stage. */
  protected pickedBoneObject(): Object3D | null {
    const picked = this.pickedBone
    if (!picked || !this.poseMode) return null
    return this.objects.get(picked.nodeId)?.getObjectByName(picked.bone) ?? null
  }

  /**
   * Where a bone rested when it arrived, remembered the first time anything asks. It is the pose
   * the FILE gave it, which is what every delta is measured against — see `applyBonePoses`.
   */
  protected boneRestOf(nodeId: string, bone: string, object: Object3D): Transform {
    const key = `${nodeId}/${bone}`
    const held = this.boneRests.get(key)
    if (held) return held

    const rest = transformOf(object)
    this.boneRests.set(key, rest)
    return rest
  }

  /**
   * A hand has let go of a camera, and which camera decides where it is written: a locked pane
   * edits the DOCUMENT, every other one moves the view, which is session state.
   */
  protected reportCameraSettled(pane: number): void {
    // Pane 0 draws with the viewport's own camera whatever its view says — it can be lent none,
    // so an orbit there moves the VIEW even where a camera was picked for it.
    const view = pane === 0 ? 'free' : this.paneViews[pane]
    const object = isCameraView(view) ? this.cameraObject(view.nodeId) : null

    if (isCameraView(view) && object) {
      this.options.onCameraMoved?.(view.nodeId, transformOf(object))
      return
    }
    if (pane === 0) this.options.onView?.(this.viewPlacement())
  }

  /**
   * The axes a joint dragged must not leave. The skeleton window owns those padlocks; the engine
   * only obeys them.
   */
  setHeldBoneAxes(axes: readonly BoneAxis[]): void {
    this.heldBoneAxes = axes
  }

  /** Aims the gizmo at a bone, or lets go of the one it held. */
  setPickedBone(picked: { nodeId: string; bone: string } | null): void {
    this.pickedBone = picked
    this.paintPickedJoint()
    this.attachGizmo()
    this.redraw()
  }

  /**
   * Puts one bone where a hand asked, leaving the REST it was given alone: the mesh follows,
   * since its skin was measured against that rest. What POSING is, as opposed to editing.
   */
  poseBone(nodeId: string, bone: string, transform: Transform): void {
    const object = this.objects.get(nodeId)?.getObjectByName(bone)
    if (!object) return

    applyTransform(object, transform)
    this.redraw()
  }

  /** The one mark saying which bone a panel is editing — nothing else in the viewport says it. */
  protected paintPickedJoint(): void {
    for (const [nodeId, joints] of this.joints)
      joints.pick(this.pickedBone?.nodeId === nodeId ? this.pickedBone.bone : null)
    for (const [nodeId, solids] of this.boneSolids)
      solids.pick(this.pickedBone?.nodeId === nodeId ? this.pickedBone.bone : null)
  }

  /**
   * Aims the gizmo at one control point of a rail, or lets go of it.
   *
   * A point is not a node, exactly as a bone is not: it has no id in the document, cannot be
   * renamed, hidden or deleted on its own. `LightDescriptor` says why that matters — a node
   * nobody can rename is a property that leaked into the tree.
   */
  setPickedPathPoint(picked: PickedPathPoint | null): void {
    this.restorePreviewedRail()
    this.pickedPathPoint = picked
    // 🛑 The aids too: the tangents of an anchor show on the one being WORKED ON, and picking one
    // is what changes that. Without this they were built, placed, and never once shown.
    this.showAidsForSelection()
    this.attachGizmo()
    this.redraw()
  }

  /**
   * The knob of the point picked, while one is picked and its rail is still being worked on.
   *
   * The rail matters as much as the knob: a point is let go of by a click in the VIEWPORT, and
   * the tree selects through another door entirely — without this the gizmo stayed on a knob the
   * selection had hidden, while the object just picked in the tree got none.
   */
  protected pickedKnob(): Object3D | null {
    const picked = this.pickedPathPoint
    if (!picked || !this.workedRailIds().has(picked.nodeId)) return null
    const name = picked.part ? handleName(picked.part, picked.index) : knobName(picked.index)
    return this.objects.get(picked.nodeId)?.getObjectByName(name) ?? null
  }
}
