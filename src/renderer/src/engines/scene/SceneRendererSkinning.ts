import { type Mesh, type Object3D, SkinnedMesh, type Bone } from 'three'
import { isBoneObject, rigStateOf } from './rigState'
import {
  applyRig,
  positionsIn,
  reskinnableMeshesOf,
  restRig,
  removeRig,
  wearsRig,
} from '../character/rigBuild'
import { createIkBinding, ikSpecsOf } from '../character/ik'
import { createBoneJoints } from './boneJoints'
import { createBoneShapes } from './boneShapes'
import type { SkinBinding } from '../character/skinVertices'
import type { Rig } from '@shared/domain/rig'
import './bvhPatches'
import { SceneRendererRig } from './SceneRendererRig'
import type { AutoRigInferenceRequest } from '@shared/domain/autoRigInference'
import type { AutoRigResult } from '@shared/domain/autoRig'
import type { AutoRigPrimitiveTarget, AutoRigSkinBinding } from '@shared/domain/autoRig'
import { autoRigBindingsFor } from '../character/autoRigBindings'
import { autoRigInputFor } from '../character/autoRigInput'
import type { MeshSample } from './rigSnap'
import { rigSnappedTo } from './rigSnap'
import { rigFit } from './rigFit'
import type { SkinWeights } from '../character/skinWeights'

type BoundMesh = { mesh: Mesh; binding: SkinBinding }

async function bindMeshes(
  skin: SkinWeights,
  meshes: readonly Mesh[],
  holder: Object3D,
  rig: Rig,
  stop: AbortController,
  current: () => boolean,
  onProgress: (index: number, progress: number) => void,
): Promise<BoundMesh[] | null> {
  const bound: BoundMesh[] = []
  for (const [index, mesh] of meshes.entries()) {
    const binding = await skin.bind(positionsIn(mesh, holder), rig, {
      signal: stop.signal,
      onProgress: progress => onProgress(index, progress),
    })
    if (!binding || !current()) return null
    bound.push({ mesh, binding })
  }
  return bound
}

export abstract class SceneRendererSkinning extends SceneRendererRig {
  protected abstract redraw(): void
  protected abstract accelerateOrReport(object: Object3D, subject: string): Promise<void>
  protected abstract paintPickedJoint(): void

  async autoRigInput(
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<Omit<AutoRigInferenceRequest, 'id' | 'backendId' | 'options'> | null> {
    const holder = this.objects.get(nodeId)
    if (!holder) return null
    return await autoRigInputFor(holder, undefined, signal)
  }

  autoRigTargets(nodeId: string): readonly AutoRigPrimitiveTarget[] {
    const holder = this.objects.get(nodeId)
    if (!holder) return []
    return reskinnableMeshesOf(holder).map((mesh, index) => ({
      mesh: index,
      primitive: 0,
      vertexCount: mesh.geometry.getAttribute('position').count,
    }))
  }

  autoRigIdentity(nodeId: string): string | null {
    const holder = this.objects.get(nodeId)
    if (!holder) return null
    return [holder.uuid, ...reskinnableMeshesOf(holder).map(mesh => mesh.geometry.uuid)].join(':')
  }

  async simpleAutoRig(
    nodeId: string,
    sample: MeshSample,
    signal: AbortSignal,
    onProgress: (progress: number) => void,
  ): Promise<AutoRigResult | null> {
    const holder = this.objects.get(nodeId)
    if (!holder) return null
    const rig = rigSnappedTo(rigFit(sample.bounds), sample)
    const meshes = reskinnableMeshesOf(holder)
    const bindings: AutoRigSkinBinding[] = []
    for (const [mesh, object] of meshes.entries()) {
      const binding = await this.skin.bind(positionsIn(object, holder), rig, {
        signal,
        onProgress: progress => onProgress((mesh + progress) / meshes.length),
      })
      if (!binding || signal.aborted || this.objects.get(nodeId) !== holder) return null
      bindings.push({ mesh, primitive: 0, ...binding })
    }
    return {
      rig,
      bindings,
      metadata: {
        backendId: 'simple',
        sourceInfluences: rig.bones.length,
        outputInfluences: 4,
        fingers: false,
      },
    }
  }

  async applyAutoRig(nodeId: string, result: AutoRigResult): Promise<boolean> {
    const holder = this.objects.get(nodeId)
    if (!holder) return false
    const meshes = reskinnableMeshesOf(holder)
    const bound = autoRigBindingsFor(
      result,
      meshes.map((object, mesh) => ({ mesh, primitive: 0, object })),
    )
    if (!bound) return false
    this.stopSkinning(nodeId)
    this.rigRests.set(nodeId, new Map(result.rig.bones.map(one => [one.name, one.rest])))
    applyRig(holder, result.rig, bound)
    this.bindIk(nodeId, holder, result.rig)
    this.options.onSkinning?.(
      nodeId,
      result.bindings.map(binding => ({
        mesh: binding.mesh,
        primitive: binding.primitive,
        joints: binding.skinIndex,
        weights: binding.skinWeight,
      })),
    )
    this.bindSkeleton(nodeId, holder, true)
    this.options.onRig?.(nodeId, rigStateOf(holder, this.animations.clipsOf(nodeId)))
    void this.accelerateOrReport(holder, nodeId)
    await this.precompile()
    this.redraw()
    return true
  }

  clearRig(nodeId: string): void {
    const holder = this.objects.get(nodeId)
    if (!holder) return
    removeRig(holder)
    this.rigRests.delete(nodeId)
    this.bindSkeleton(nodeId, holder, false)
    this.options.onSkinning?.(nodeId, [])
    this.options.onRig?.(nodeId, rigStateOf(holder, this.animations.clipsOf(nodeId)))
    this.redraw()
  }
  /**
   * Weights every mesh of a model against a rig, then binds them — what « make animatable » does.
   *
   * Public because the skeleton window is what asks for it now: a scene reads the skin its files
   * already carry, and only an editor puts a new one on. Off the UI thread and reporting as it
   * goes — half a million vertices against fifty-two bones is twenty-six million distances.
   */
  async skinModel(nodeId: string, rig: Rig): Promise<void> {
    const holder = this.objects.get(nodeId)
    if (!holder) return
    // Before the branches below, which all return early: the leash needs the rig either way.
    this.rigRests.set(nodeId, new Map(rig.bones.map(one => [one.name, one.rest])))
    if (wearsRig(holder, rig)) {
      restRig(holder, rig)
      this.bindIk(nodeId, holder, rig)
      this.redraw()
      return
    }
    const meshes = reskinnableMeshesOf(holder)
    if (meshes.length === 0) return
    this.stopSkinning(nodeId)
    const stop = new AbortController()
    this.skinning.set(nodeId, stop)
    try {
      const current = () => this.skinning.get(nodeId) === stop
      const bound = await bindMeshes(this.skin, meshes, holder, rig, stop, current, (index, part) =>
        this.options.onRigProgress?.(nodeId, (index + part) / meshes.length),
      )
      if (!bound) return
      if (this.objects.get(nodeId) !== holder || this.skinning.get(nodeId) !== stop) return
      await this.applySkinning(nodeId, holder, rig, bound)
    } finally {
      if (this.skinning.get(nodeId) === stop) {
        this.skinning.delete(nodeId)
        this.options.onRigProgress?.(nodeId, 1)
      }
    }
  }

  private async applySkinning(
    nodeId: string,
    holder: Object3D,
    rig: Rig,
    bound: readonly BoundMesh[],
  ): Promise<void> {
    applyRig(holder, rig, bound)
    this.bindIk(nodeId, holder, rig)
    this.options.onSkinning?.(
      nodeId,
      bound.map((one, index) => ({
        mesh: index,
        primitive: 0,
        joints: one.binding.skinIndex,
        weights: one.binding.skinWeight,
      })),
    )
    void this.accelerateOrReport(holder, nodeId)
    this.bindSkeleton(nodeId, holder, true)
    this.options.onRig?.(nodeId, rigStateOf(holder, this.animations.clipsOf(nodeId)))
    await this.precompile()
    this.redraw()
  }
  /**
   * The chains this model reaches with, if any — solved once a frame in `advance`.
   *
   * Built from the skeleton the rig just made rather than from the document: the solver holds
   * bone INDICES, so it only means anything against the bones actually bound.
   */
  protected bindIk(nodeId: string, holder: Object3D, rig: Rig): void {
    this.iks.delete(nodeId)
    if (!rig.ik?.length) return
    const skinned = holder.getObjectByProperty('isSkinnedMesh', true)
    if (!(skinned instanceof SkinnedMesh)) return
    const names = skinned.skeleton.bones.map(one => one.name)
    const binding = createIkBinding(skinned, ikSpecsOf(names, rig.ik))
    if (binding) this.iks.set(nodeId, binding)
  }
  /**
   * The programs the stage now needs, built BEFORE the frame that would need them.
   *
   * 🛑 A skinned mesh is a shader variant of its own, so binding a rig asks for four programs the
   * first frame after it: 292 ms on a warm shader cache, 8.4 SECONDS cold — and invisible to a
   * JavaScript profile, since a driver compiles in the GPU process. Measured 2026-09-02.
   */
  protected async precompile(): Promise<void> {
    const gl = this.viewport.gl
    if (!gl) return
    try {
      await gl.compileAsync(this.viewport.scene, this.viewport.camera)
    } catch {
      // Nothing to fall back to: the frame compiles what this could not, as it always did.
    }
  }
  /** Twenty-six million distances are not worth finishing for a model nobody will see again. */
  protected stopSkinning(nodeId: string): void {
    this.skinning.get(nodeId)?.abort()
    this.skinning.delete(nodeId)
  }
  /**
   * Joints and solids are built from the instance and hung beside the nodes, like the grid and
   * the trihedron — never inside the model, where the outliner would list them and a click could
   * pick them.
   */
  protected bindSkeleton(nodeId: string, root: Object3D, hasBones: boolean): void {
    this.unbindSkeleton(nodeId)
    if (!hasBones) return
    // Not three's `SkeletonHelper`: its lines showed through the solids, and a skeleton read as
    // half wireframe — measured on screen.
    const bones: Bone[] = []
    root.traverse(object => {
      if (isBoneObject(object)) bones.push(object)
    })
    // The joints mark where two bones MEET, which is the thing a click and a gizmo are aimed at.
    const joints = createBoneJoints(bones)
    joints.points.visible = this.skeletonsVisible()
    this.joints.set(nodeId, joints)
    this.viewport.scene.add(joints.points)
    // The bones as solids: a segment tells nothing about a bone's facing, so a rotation had no
    // landmark at all.
    const solids = createBoneShapes(bones)
    solids.mesh.visible = this.skeletonsVisible()
    this.boneSolids.set(nodeId, solids)
    this.viewport.scene.add(solids.mesh)
    // A skeleton bound after the pick — every reload of a model does this — would otherwise draw
    // its joints at rest while a panel names one of them.
    this.paintPickedJoint()
  }
  protected unbindSkeleton(nodeId: string): void {
    const solids = this.boneSolids.get(nodeId)
    if (solids) {
      solids.mesh.removeFromParent()
      solids.dispose()
      this.boneSolids.delete(nodeId)
    }
    const joints = this.joints.get(nodeId)
    if (joints) {
      joints.points.removeFromParent()
      joints.dispose()
      this.joints.delete(nodeId)
    }
  }
}
