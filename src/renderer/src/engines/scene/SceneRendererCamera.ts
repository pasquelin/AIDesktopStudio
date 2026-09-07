import { type Object3D, type PerspectiveCamera } from 'three'
import type { CameraMotion, CameraShot, CameraTarget } from '@shared/domain/animation'
import { curveOf } from './cameraPath'
import { clampUnit, progressAt } from './cameraMotion'
import { shotCameras, shotOfCameraAt } from './cameraShots'
import { applyCamera } from './threeSync'
import { drivenNodes, lensAt, poseAt } from './animationEval'
import { type AnimationTimeline } from '@shared/domain/animation'
import { applyTransform, transformOf } from './pivot'
import './bvhPatches'
import { type TransformMode } from './gizmoTarget'
import { type Snapping } from '@shared/domain/snap'
import { aimed, railed } from './sceneRendererSupport2'
import { SceneRendererAnimation } from './SceneRendererAnimation'
export abstract class SceneRendererCamera extends SceneRendererAnimation {
  protected abstract cameraObject(cameraNodeId: string | null): PerspectiveCamera | null
  protected abstract attachGizmo(): void
  protected abstract redraw(): void
  protected abstract applySnap(): void
  /**
   * The cameras a shot still names, plus the ones just let go that could not be put back yet.
   *
   * Nothing else in the engine writes a camera's position, so a shot deleted — or the undo of one
   * that opened — would leave its camera wherever the rail last put it, and the film would go on
   * being taken from there. One held over is a camera the gizmo carries, whose shot an undo took
   * away mid-drag: forfeiting the one attempt makes the rail its rest pose on release, and a
   * camera the document has lost leaves `applied`, so this cannot pile up.
   */
  private restedAndStillHeld(named: ReadonlySet<string>): Set<string> {
    const held = new Set(named)
    for (const cameraId of this.railedCameras) {
      if (named.has(cameraId)) continue
      if (!this.restCamera(cameraId) && this.applied.has(cameraId)) held.add(cameraId)
    }
    return held
  }

  /** Each named camera at its rest pose, paired with the shot covering the playhead. */
  private shotsDrivingNow(named: ReadonlySet<string>): { object: Object3D; shot: CameraShot }[] {
    const driven: { object: Object3D; shot: CameraShot }[] = []
    for (const cameraId of named) {
      // Where the document holds it, before any shot has its say: unbinding a rail, or deleting
      // it, leaves a shot that covers the head and moves nothing.
      const object = this.restCamera(cameraId)
      if (!object) continue
      const shot = shotOfCameraAt(this.timeline, cameraId, this.playhead)
      if (shot) driven.push({ object, shot })
    }
    return driven
  }

  /**
   * Where the shots put their cameras at the instant the head stands on: along a rail, aimed at
   * a target, or both.
   *
   * After `applyPoses` and never before: a camera may be told to watch a node that is itself
   * animated, and aiming at where that node USED to be lags one frame behind for good.
   */
  protected applyCameraShots(): void {
    const shots = this.timeline.shots
    // Nothing named and nothing to put back: a scene with no shot at all allocates nothing here,
    // and this runs once per frame of playback.
    if (shots.length === 0 && this.railedCameras.size === 0) return
    // Walked from the SHOTS rather than from the nodes, exactly as `applyLenses` is: a camera no
    // shot names is one this pass has nothing to do to, and this ran over every node per frame.
    const named = new Set(shotCameras(shots))
    this.railedCameras = this.restedAndStillHeld(named)
    if (named.size === 0) return
    const driven = this.shotsDrivingNow(named)
    // Every rail before any aim, and not one camera at a time: a shot may watch a camera that is
    // itself riding one, and aiming at where that camera stood BEFORE its rail ran is wrong for
    // the whole length of the shot rather than by one scrub step.
    for (const { object, shot } of driven) {
      if (shot.motion) this.railCamera(object, shot, shot.motion)
    }
    for (const { object, shot } of driven) {
      if (shot.target) this.aimCamera(object, shot.target)
    }
  }
  /**
   * A camera put back where the document holds it, tracks included, and the object it stands for.
   * `null` for one the gizmo carries — its transform is relative to the pivot, see `applyPoses`.
   */
  protected restCamera(cameraId: string): Object3D | null {
    const node = this.applied.get(cameraId)
    const object = this.objects.get(cameraId)
    if (node?.type !== 'camera' || !object || object.parent === this.pivot) return null
    applyTransform(object, poseAt(node.transform, this.timeline, cameraId, this.playhead))
    return object
  }
  /** Puts a camera where its rail says, in the frame of whatever the camera hangs from. */
  protected railCamera(object: Object3D, shot: CameraShot, motion: CameraMotion): void {
    const rail = this.applied.get(motion.pathId)
    const railObject = this.objects.get(motion.pathId)
    if (rail?.type !== 'path' || !railObject) return
    // The two chains this reads, and nothing else. `scene.updateMatrixWorld(true)` stood here
    // and recomposed EVERY object of the scene, bones included, once per frame of playback —
    // some 15 000 compose-and-multiply pairs on a large scene, against the six below. `aimCamera`
    // needs none: `getWorldPosition` refreshes its own chain.
    railObject.updateWorldMatrix(true, false)
    object.parent?.updateWorldMatrix(true, false)
    // `getPointAt`, never `getPoint`: the second is parameterised per segment, so a camera
    // speeds up through the short ones — the very defect a rail exists to avoid. Into a scratch
    // vector, since this runs per frame of playback.
    const along = curveOf(rail.path).getPointAt(
      clampUnit(progressAt(shot, motion, this.playhead)),
      railed,
    )
    const world = railObject.localToWorld(along)
    object.position.copy(object.parent ? object.parent.worldToLocal(world) : world)
  }
  /** Turns a camera towards a point of the scene, or towards whatever a node stands at. */
  protected aimCamera(object: Object3D, target: CameraTarget): void {
    if (target.kind === 'point') {
      object.lookAt(target.at.x, target.at.y, target.at.z)
      return
    }
    // A camera cannot watch itself: doing so leaves `lookAt` with a direction of no length, and
    // the quaternion it hands back is the identity — a shot silently aimed down the Z axis.
    const watched = target.nodeId === object.name ? null : this.objects.get(target.nodeId)
    if (watched) object.lookAt(watched.getWorldPosition(aimed))
  }
  /**
   * Lays the timeline over the rest poses. Only the nodes it drives are touched, and a scene
   * with no track at all leaves before building anything.
   */
  protected applyPoses(): void {
    const timeline = this.timeline
    if (timeline.tracks.length === 0) return
    // A pose displaces without adding anything, so the counters are left alone and only the
    // shadow reach has to be read again.
    this.placementChanged = true
    for (const nodeId of drivenNodes(timeline)) {
      const object = this.objects.get(nodeId)
      const rest = this.applied.get(nodeId)?.transform
      // A node the gizmo is carrying holds a transform relative to the pivot, not to the scene:
      // writing a world pose into it mid-drag would teleport it, exactly as `syncNode` warns.
      if (!object || !rest || object.parent === this.pivot) continue
      applyTransform(object, poseAt(rest, timeline, nodeId, this.playhead))
    }
    this.applyBonePoses(timeline)
    this.applyLenses(timeline)
  }
  /**
   * What the `fov` channels add to each camera's own field of view, in degrees.
   *
   * Walked from the CHANNELS rather than from the nodes: a scene of a thousand objects and no
   * lens channel is one that leaves here having read nothing.
   */
  protected applyLenses(timeline: AnimationTimeline): void {
    const lensed = new Set(
      timeline.tracks.flatMap(track =>
        track.target.property === 'fov' ? track.target.nodeId : [],
      ),
    )
    for (const nodeId of lensed) {
      const node = this.applied.get(nodeId)
      const camera = this.cameraObject(nodeId)
      if (node?.type !== 'camera' || !camera) continue
      // The descriptor itself where every channel is muted or soloed away, never "leave it
      // alone": the lens would otherwise keep whatever the last scrub wrote, on screen and in a
      // render alike.
      applyCamera(camera, lensAt(node.camera, timeline, nodeId, this.playhead))
    }
  }
  /**
   * The same, for the bones inside a model. Their rest pose is the one the FILE gave them, not
   * one the document holds — a document holds a reference to a model, never its skeleton — so
   * it is read off the bone the first time a track asks for it and kept.
   */
  protected applyBonePoses(timeline: AnimationTimeline): void {
    for (const track of timeline.tracks) {
      const bone = track.target.bone
      if (!bone) continue
      const object = this.objects.get(track.target.nodeId)?.getObjectByName(bone)
      if (!object) continue
      const key = `${track.target.nodeId}/${bone}`
      const rest = this.boneRests.get(key) ?? transformOf(object)
      this.boneRests.set(key, rest)
      applyTransform(object, poseAt(rest, timeline, track.target.nodeId, this.playhead, bone))
    }
  }
  setMode(mode: TransformMode): void {
    this.mode = mode
    // `TransformControls` knows only three modes; `select` is ours, and means no gizmo at all.
    if (mode !== 'select') this.gizmo?.setMode(mode)
    this.attachGizmo()
    this.redraw()
  }
  /** Which snaps a drag obeys: the steps `configure` was given, and the surface under it. */
  setSnapping(snapping: Snapping): void {
    this.snapping = snapping
    this.applySnap()
  }
}
