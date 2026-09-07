import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Raycaster,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { describe, expect, it, vi } from 'vitest'
import { INFLUENCES } from '../character/skinMessage'
// Imported for its side effect: this file's whole subject is what it does to three's prototypes.
import './bvhPatches'

/** A box driven by one bone that moves nothing — a character standing in its own rest pose. */
function skinnedBox(): SkinnedMesh {
  const geometry = new BoxGeometry(1, 1, 1)
  const vertices = geometry.getAttribute('position').count
  geometry.setAttribute(
    'skinIndex',
    new Uint16BufferAttribute(new Uint16Array(vertices * INFLUENCES), INFLUENCES),
  )
  geometry.setAttribute(
    'skinWeight',
    new Float32BufferAttribute(
      Float32Array.from({ length: vertices * INFLUENCES }, (_, at) =>
        at % INFLUENCES === 0 ? 1 : 0,
      ),
      INFLUENCES,
    ),
  )

  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial())
  const root = new Bone()
  mesh.add(root)
  mesh.bind(new Skeleton([root]))
  mesh.updateMatrixWorld(true)
  return mesh
}

const straightAt = (mesh: SkinnedMesh, x = 0): Vector3 | null =>
  new Raycaster(new Vector3(x, 0, 4), new Vector3(0, 0, -1)).intersectObject(mesh, true)[0]
    ?.point ?? null

/** The one bone carried three metres aside, which is what a raised arm is to one vertex. */
function posed(mesh: SkinnedMesh): SkinnedMesh {
  const bone = mesh.skeleton.bones[0]
  if (bone) bone.position.x = 3
  mesh.updateMatrixWorld(true)
  return mesh
}

describe('a ray at a character', () => {
  // 🛑 `SkinnedMesh` declares a `raycast` of its own, which shadows the accelerated `Mesh` one.
  // Every surface that aims at a model reads this — the wheel, a click, a rail laid on scenery.
  it('reads the tree rather than re-skinning every vertex', () => {
    const mesh = skinnedBox()
    mesh.geometry.boundsTree = new MeshBVH(mesh.geometry)
    const reskinned = vi.spyOn(mesh, 'applyBoneTransform')

    expect(straightAt(mesh)?.z).toBeCloseTo(0.5, 5)
    expect(reskinned).not.toHaveBeenCalled()
  })

  // The tree is an ACCELERATION, never another answer: a mesh with one and a mesh without have
  // to meet the same surface, or a click would land somewhere a drag then contradicts.
  it('meets the same surface with a tree as without one', () => {
    const bare = straightAt(skinnedBox())
    const accelerated = skinnedBox()
    accelerated.geometry.boundsTree = new MeshBVH(accelerated.geometry)

    expect(straightAt(accelerated)?.toArray()).toEqual(bare?.toArray())
  })

  /**
   * 🛑 The tree holds the REST shape. Read unconditionally it made a posed character pickable
   * only where it is NOT: a click on a raised arm found nothing, and the air beside it selected.
   */
  it('meets a posed character where the pose put it, tree or no tree', () => {
    const accelerated = posed(skinnedBox())
    accelerated.geometry.boundsTree = new MeshBVH(accelerated.geometry)

    expect(straightAt(accelerated, 3)?.x).toBeCloseTo(3, 5)
    expect(straightAt(posed(skinnedBox()), 3)?.x).toBeCloseTo(3, 5)
  })

  // The other half of the same defect: where the character no longer is, nothing is met.
  it('meets nothing where a posed character used to rest', () => {
    const accelerated = posed(skinnedBox())
    accelerated.geometry.boundsTree = new MeshBVH(accelerated.geometry)

    expect(straightAt(accelerated, 0)).toBeNull()
  })
})
