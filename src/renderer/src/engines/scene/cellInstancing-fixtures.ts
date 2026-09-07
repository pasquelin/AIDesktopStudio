import { BoxGeometry, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera } from 'three'
import { meshNode } from './scene-fixtures'
import type { SceneNode } from './sceneState'

/** Bodies of one shape, laid out by the caller — which is the whole of what a cell is decided by. */
export function bodies(
  places: readonly number[],
  geometry: BoxGeometry = new BoxGeometry(1, 1, 1),
  z = 0,
  named = 'n',
): { nodes: SceneNode[]; objects: Map<string, Mesh> } {
  const nodes: SceneNode[] = []
  const objects = new Map<string, Mesh>()
  const material = new MeshStandardMaterial()

  for (const [at, x] of places.entries()) {
    const node = meshNode(`${named}${at}`)
    const mesh = new Mesh(geometry, material)
    mesh.position.set(x, 0, z)
    mesh.updateMatrixWorld(true)
    nodes.push(node)
    objects.set(node.id, mesh)
  }
  return { nodes, objects }
}

/** Beside the camera, in the NEXT cell along z, and inside a view of 500 that turns to it. */

/** `count` bodies inside one cell, around `x`. */
export const inOneCell = (count: number, x: number): number[] =>
  Array.from({ length: count }, (_unused, at) => x + at)

export const host = (): Object3D => new Object3D()

/** A view of `far` from where it stands, aimed along `at` — what decides what is drawn. */
export function looking(
  x: number,
  far: number,
  at: { x: number; z: number } = { x: 1, z: 0 },
): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, 1, 0.1, far)
  camera.position.set(x, 0, 0)
  camera.lookAt(x + at.x, 0, at.z)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  return camera
}
