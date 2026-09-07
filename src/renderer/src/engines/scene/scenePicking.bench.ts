import { bench } from '@shared/vitestBench'
import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  SphereGeometry,
  Vector2,
} from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { describe } from 'vitest'
// The studio's own patches, never a copy: this bench listed three of the four, so it timed the
// slow path for a skinned mesh while the app took the fast one.
import './bvhPatches'

/**
 * What one click costs. The picker walks every object of the scene on every click — never per
 * frame — so the question this answers is whether a heavy set makes selecting feel slow, and
 * therefore whether a BVH is worth its build.
 *
 * A ray that hits is the expensive one: three.js tests a bounding sphere first and only then
 * walks triangles, so a miss costs nothing whatever the density. Both are measured.
 */

const material = new MeshStandardMaterial()

/** A dense generated asset, as one node holding many triangles — the shape a GLB arrives in. */
function denseModel(segments: number): Object3D {
  const holder = new Object3D()
  holder.add(new Mesh(new SphereGeometry(1, segments, segments / 2), material))
  holder.updateMatrixWorld(true)
  return holder
}

function set(count: number, segments: number, tree = false): Object3D[] {
  return Array.from({ length: count }, () => {
    const model = denseModel(segments)
    if (tree) {
      model.traverse(child => {
        if (child instanceof Mesh) child.geometry.boundsTree = new MeshBVH(child.geometry)
      })
    }
    return model
  })
}

/** A scene dense the other way: many small objects rather than few heavy ones. */
function crowd(count: number): Object3D[] {
  return Array.from({ length: count }, (_unused, index) => {
    const mesh = new Mesh(new BoxGeometry(), material)
    mesh.position.set(index % 50, Math.floor(index / 50), 0)
    mesh.updateMatrixWorld(true)
    return mesh
  })
}

const raycaster = new Raycaster()
const camera = new PerspectiveCamera(60, 1, 0.1, 1000)
camera.position.set(0, 0, 5)
camera.updateMatrixWorld(true)

/** Dead centre, where the spheres are: the ray hits, which is the case that walks triangles. */
const CENTRE = new Vector2(0, 0)
/** A corner, where nothing sits: only the bounding volumes are tested. */
const CORNER = new Vector2(0.98, 0.98)

function pick(targets: Object3D[], pointer: Vector2): void {
  raycaster.setFromCamera(pointer, camera)
  raycaster.intersectObjects(targets, true)
}

describe('picking an object with a click', () => {
  const cases: [string, Object3D[]][] = [
    ['3 models of 32k triangles', set(3, 128)],
    ['3 models of 131k triangles', set(3, 256)],
    ['3 models of 524k triangles', set(3, 512)],
    ['2500 small meshes', crowd(2500)],
    ['3 models of 131k triangles, with a tree', set(3, 256, true)],
    ['3 models of 524k triangles, with a tree', set(3, 512, true)],
  ]

  for (const [label, targets] of cases) {
    bench(`${label} — the ray hits`, () => pick(targets, CENTRE))
    bench(`${label} — the ray misses`, () => pick(targets, CORNER))
  }
})
