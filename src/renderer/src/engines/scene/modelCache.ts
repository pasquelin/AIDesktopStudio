import type { Object3D } from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { assetUrl, versionedUrl } from '@shared/domain/assetAccess'
import { createRefCache, type RefCache } from '../core/refCache'

/** A port rather than a hard-wired `GLTFLoader`, like `TextureSource`: jsdom decodes no GLB. */
export type ModelSource = (url: string) => Promise<Object3D>

export type ModelCache = RefCache<Object3D>

/** One key per FILE VERSION: a model ⌘S rewrote is another entry, freed when its last node lets go. */
export function modelKeyOf(assetId: string, version?: string): string {
  return versionedUrl(assetUrl(assetId), version)
}

/**
 * One parse per key, however many nodes point at it — a hundred trees are one file read once.
 * What `acquire` hands back is the shared source; the caller clones it, sharing geometries and
 * materials, so the GPU uploads them once and the last release frees them for every clone.
 */
export function createModelCache(
  load: ModelSource,
  onFailure: (key: string, error: unknown) => void,
): ModelCache {
  // The key IS the url: `load` needs nothing translated.
  return createRefCache({ load, free: disposeTree, onFailure })
}

/**
 * What the scene actually adds: a copy sharing the source's geometries and materials, so a
 * hundred trees are one upload — and its own transform, so moving one moves nothing else.
 */
export function instanceOf(source: Object3D): Object3D {
  // `SkeletonUtils.clone` rather than `clone`: `SkinnedMesh.copy` keeps the SOURCE's skeleton, so
  // every instance of a rigged model would be driven by the bones of the cached original — pose
  // one and they all move. It rebinds each copy onto its own copied bones.
  return cloneSkinned(source)
}

/**
 * Every geometry and every material a loaded file brought. A GLB is a tree, not one mesh, and a
 * `dispose` on its root frees nothing at all — which is how a project browsed for an afternoon
 * runs the GPU out of memory.
 */
export function disposeTree(root: Object3D): void {
  root.traverse(object => {
    if (!isRenderable(object)) return

    object.geometry.dispose()
    for (const material of materialsOf(object)) {
      // The maps too: they came with the file rather than from the texture cache, so nothing
      // else is counting references on them.
      for (const value of Object.values(material)) {
        if (isDisposableTexture(value)) value.dispose()
      }
      material.dispose()
    }
  })
}

type Renderable = Object3D & {
  geometry: { dispose: () => void }
  material: Disposable | Disposable[]
}

type Disposable = { dispose: () => void }

function isRenderable(object: Object3D): object is Renderable {
  return 'geometry' in object && 'material' in object
}

function materialsOf(object: Renderable): Disposable[] {
  return Array.isArray(object.material) ? object.material : [object.material]
}

function isDisposableTexture(value: unknown): value is Disposable {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isTexture' in value &&
    typeof Reflect.get(value, 'dispose') === 'function'
  )
}
