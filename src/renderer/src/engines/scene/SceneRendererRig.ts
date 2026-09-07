import { type Camera } from 'three'
import { type DrawRequest } from '../viewport/ViewportEngine'
import { type SceneState } from './sceneState'
import { SCENE_SUBJECT_ID } from '@shared/domain/animation'
import { postOf, type PostStack } from '@shared/domain/postProcessing'
import { type ProjectedSegment } from './bonePicking'
import { measuredMeshOf } from './rigState'
import { restInverses } from '../character/rigBuild'
import { leafTail } from './boneShapes'
import { type MeshSample } from './rigSnap'
import './bvhPatches'
import { BONE_WORLD, BONE_TAIL } from './sceneRendererSupport2'
import { SceneRendererDisplay } from './SceneRendererDisplay'

export abstract class SceneRendererRig extends SceneRendererDisplay {
  protected abstract attachGizmo(): void

  protected abstract redraw(): void

  abstract setSculptMode(on: boolean): void

  /**
   * Which stack a surface films through, animated to where the head stands.
   *
   * A pane composes only in `shaded`, the mode that shows a RENDER: the other display modes are
   * there to measure a geometry, and a bloom over a wireframe measures nothing. It is the same
   * rule a compositor follows, and `displays` already carries it per pane.
   */
  protected stackOf(request: DrawRequest): PostStack | null {
    // The render is deliberately out: a comparison is something one looks at, never something
    // that changes what a film is written from.
    if (this.bypassed && request.surface !== 'offscreen') return null

    if (request.surface === 'pane') {
      const mode = this.displays[request.paneIndex] ?? this.displays[0] ?? 'shaded'
      return mode === 'shaded' ? this.sceneStack() : null
    }

    return this.cameraStack(request.cameraNodeId)
  }

  /**
   * Frees the chains no composition of the document asks for any more — a camera that stopped
   * overriding, an effect removed from the scene. Without it the only release is the cache's own
   * ceiling, and a stack nothing can name again holds its buffers until six others push it out.
   */
  protected sweepCompositions(state: SceneState): void {
    const live = [state.world.post]
    for (const node of state.nodes) {
      if (node.type === 'camera' && node.camera.post?.mode === 'override') {
        live.push(node.camera.post.stack)
      }
    }
    this.post?.sweep(live)
  }

  /** One subject's stack, animated to the head and held for the image — see `animatedStack`. */
  protected stackAtHead(rest: PostStack, subject: string): PostStack {
    return this.animated.of(rest, this.timeline, subject, this.playhead)
  }

  /** The scene's own composition, opened by whatever its channels add at this instant. */
  protected sceneStack(): PostStack {
    return this.stackAtHead(this.world.post, SCENE_SUBJECT_ID)
  }

  /**
   * What a camera of the document films through. `postOf` is the arbiter — the domain's, and the
   * same one the MCP handlers ask — so the engine only decides WHICH SUBJECT to animate on: a
   * camera overriding hears its own channels, one inheriting hears the scene's.
   */
  protected cameraStack(cameraId: string | null): PostStack | null {
    const node = cameraId === null ? null : this.applied.get(cameraId)
    const camera = node?.type === 'camera' ? node.camera.post : undefined
    const stack = postOf(this.world.post, camera)
    if (!stack) return null

    return this.stackAtHead(
      stack,
      camera?.mode === 'override' ? (cameraId ?? '') : SCENE_SUBJECT_ID,
    )
  }

  /**
   * Whether the bones of every rigged model are drawn over it. A rig is what a motion model
   * hands back, and nothing else in the viewport says whether a mesh carries one.
   */
  setSkeletons(shown: boolean): void {
    if (shown === this.showSkeletons) return
    this.showSkeletons = shown

    this.refreshSkeletons()
  }

  /**
   * Whether the bones on stage are the REST pose being edited rather than a pose being struck.
   *
   * The skeleton window sets it and nothing else does: there, a joint dragged is a joint put
   * where it belongs, and the mesh must not follow it. A scene poses instead, and the whole
   * point there is that the mesh DOES follow.
   */
  setRestEditing(on: boolean): void {
    this.restEditing = on
    if (on) this.restSkins()
    // The two states hand the gizmo different things: editing PLACES the joint, posing turns the
    // bone arriving at it through a handle standing outside the chain.
    this.attachGizmo()
    this.redraw()
  }

  /** Every skin of the stage re-measured from where its bones stand now. */
  protected restSkins(): void {
    for (const holder of this.objects.values()) restInverses(holder)
  }

  /** The one place the rule lives: written three times, one copy was already wrong. */
  protected skeletonsVisible(): boolean {
    return this.showSkeletons || this.poseMode
  }

  protected refreshSkeletons(): void {
    for (const joints of this.joints.values()) joints.points.visible = this.skeletonsVisible()
    for (const solids of this.boneSolids.values()) solids.mesh.visible = this.skeletonsVisible()
    this.redraw()
  }

  /**
   * Whether a click picks a bone instead of a mesh. The skeletons are shown while it is on: a
   * mode that picks what nothing draws is a mode nobody can aim.
   */
  setPoseMode(on: boolean): void {
    if (on === this.poseMode) return
    this.poseMode = on
    if (on) this.setSculptMode(false)

    this.refreshSkeletons()
  }

  /**
   * Every bone as a SEGMENT on screen — from its own joint to its child's, which is the shape a
   * hand aims at. Built per click rather than kept: a bone moves with its rig, and a cached
   * projection would name whatever stood there a frame ago.
   */
  protected projectedSegments(camera: Camera): ProjectedSegment[] {
    const segments: ProjectedSegment[] = []

    for (const [nodeId, solids] of this.boneSolids) {
      // The very stretches drawn: the hips are clickable on the way to either leg, not only up
      // the spine.
      for (const { bone, child } of solids.links) {
        if (!bone.name) continue

        bone.getWorldPosition(BONE_WORLD)
        // The stub drawn for a bone with no child is clickable too: a hand is taken by it.
        if (child) child.getWorldPosition(BONE_TAIL)
        else leafTail(bone, BONE_WORLD, BONE_TAIL)
        BONE_WORLD.project(camera)
        BONE_TAIL.project(camera)

        segments.push({
          nodeId,
          bone: bone.name,
          head: { x: BONE_WORLD.x, y: BONE_WORLD.y, z: BONE_WORLD.z },
          tail: { x: BONE_TAIL.x, y: BONE_TAIL.y, z: BONE_TAIL.z },
        })
      }
    }

    return segments
  }

  /** Measured NOW: `rigStateOf` stops measuring the moment a model carries bones. */
  meshSample(nodeId: string): MeshSample | null {
    const holder = this.objects.get(nodeId)
    return holder ? measuredMeshOf(holder) : null
  }
}
