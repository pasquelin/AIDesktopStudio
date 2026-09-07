import { Box3, Vector3, type Object3D } from 'three'
import { isBoneObject } from './rigState'

/** Meshes define their bounds; a meshless animation is framed by its joints. */
export function boundsOf(objects: Iterable<Object3D>): Box3 {
  const bounds = new Box3()
  const point = new Vector3()
  const enclosed = new Box3()
  for (const object of objects) {
    enclosed.makeEmpty().expandByObject(object)
    if (enclosed.isEmpty()) {
      object.updateWorldMatrix(true, true)
      object.traverse(child => {
        if (isBoneObject(child)) enclosed.expandByPoint(child.getWorldPosition(point))
      })
    }
    bounds.union(enclosed)
  }
  return bounds
}
