/**
 * three's raycast, accelerated wherever a mesh carries a `boundsTree`.
 *
 * Imported for its SIDE EFFECT, by whoever casts a ray or measures one. Held apart because the
 * copy in `scenePicking.bench.ts` had drifted: it patched three prototypes of the four, so the
 * bench timed the slow path while the studio took the fast one, and nothing said so.
 *
 * All of them in ONE module: `BatchedMesh` overrides `raycast`, so patching `Mesh.prototype`
 * alone leaves a lot walking its whole buffer under every instance.
 */
import {
  BatchedMesh,
  BufferGeometry,
  Matrix4,
  Mesh,
  SkinnedMesh,
  type Intersection,
  type Raycaster,
} from 'three'
import {
  acceleratedRaycast,
  computeBatchedBoundsTree,
  computeBoundsTree,
  disposeBatchedBoundsTree,
  disposeBoundsTree,
} from 'three-mesh-bvh'

// three-mesh-bvh reads a `boundsTree` if the mesh has one and falls back to walking triangles if
// it has none, so patching the prototypes once is safe for every mesh in the studio — the two
// other 3D spaces included, where no tree is ever built.
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
Mesh.prototype.raycast = acceleratedRaycast
BatchedMesh.prototype.computeBoundsTree = computeBatchedBoundsTree
BatchedMesh.prototype.disposeBoundsTree = disposeBatchedBoundsTree
BatchedMesh.prototype.raycast = acceleratedRaycast

/** three's own, kept: it is the only one that reads a character where the pose actually put it. */
const posedRaycast = SkinnedMesh.prototype.raycast

/**
 * 🛑 A tree is built off the REST positions, so it answers the shape a character rests in. Taken
 * unconditionally, a ray at a raised arm met the air the arm rests in — measured.
 */
SkinnedMesh.prototype.raycast = function (raycaster: Raycaster, intersects: Intersection[]): void {
  if (this.geometry.boundsTree && atBindPose(this))
    acceleratedRaycast.call(this, raycaster, intersects)
  else posedRaycast.call(this, raycaster, intersects)
}

/** Scratch for the pose check, which runs per ray and must allocate nothing. */
const OFFSET = new Matrix4()

const IDENTITY: readonly number[] = new Matrix4().elements.slice()

/**
 * How far a bone may drift and the skin still count as unposed — a millimetre on a metre, in the
 * units the model is authored in.
 */
const STILL = 1e-3

/**
 * Whether the skin stands exactly where the weights were measured from, which is the one case the
 * rest-built tree answers the same ray as three's own walk: 1 809 ms against 0.2 ms, same point.
 */
function atBindPose(mesh: SkinnedMesh): boolean {
  const { bones, boneInverses } = mesh.skeleton

  for (let index = 0; index < bones.length; index += 1) {
    const bone = bones[index]
    const inverse = boneInverses[index]
    if (!bone || !inverse) return false

    OFFSET.multiplyMatrices(bone.matrixWorld, inverse)
    for (const [at, expected] of IDENTITY.entries()) {
      if (Math.abs((OFFSET.elements[at] ?? 0) - expected) > STILL) return false
    }
  }

  return true
}
