import type { BufferGeometry, InstancedMesh, Mesh, Object3D, Texture } from 'three'
import type { AnimationTimeline } from '@shared/domain/animation'
import { createGeometryCache } from '@/engines/scene/geometryCache'
import { SceneAnimations } from '@/engines/scene/animation'

/** What a game scene holds open for as long as it is shown, and hands back when it goes. */
export type SceneResources = {
  geometries: ReturnType<typeof createGeometryCache>
  /** The PROMISE, not the texture: two nodes wearing one picture must decode it once. */
  textures: Map<string, Promise<Texture>>
  models: Map<string, Promise<Object3D>>
  /** A mesh a model lent us: the model cache frees it, so the scene must not. */
  modelMeshes: WeakSet<Mesh>
  ownedModelGeometries: Set<BufferGeometry>
  animations: SceneAnimations
  /** What a whole frame of `place` left to settle — the instanced bounds, once, not per call. */
  staleInstances: Set<InstancedMesh>
  /** The objects `place` moved since the last frame settled — what the shadow bounds grow by. */
  movedObjects: Set<Object3D>
  /** A picture landed on a material since the last frame: what a frame drawing on change reads. */
  textureArrived: boolean
}

export function createSceneResources(timeline: AnimationTimeline): SceneResources {
  const animations = new SceneAnimations()
  animations.setTimeline(timeline)
  return {
    geometries: createGeometryCache(),
    textures: new Map(),
    models: new Map(),
    modelMeshes: new WeakSet(),
    ownedModelGeometries: new Set(),
    animations,
    staleInstances: new Set(),
    movedObjects: new Set(),
    textureArrived: false,
  }
}
