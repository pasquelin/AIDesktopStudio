import { InstancedMesh, Matrix4, Object3D, type BufferGeometry, type Material } from 'three'
import { applyTransform } from './pivot'
import type { BakedInstance } from './sceneState'

export function bakedInstancesOf(
  geometry: BufferGeometry,
  material: Material | Material[],
  instances: readonly BakedInstance[],
  sourceMatrix?: Matrix4,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, instances.length)
  const placement = new Object3D()
  for (const [slot, instance] of instances.entries()) {
    applyTransform(placement, instance.transform)
    placement.updateMatrix()
    mesh.setMatrixAt(
      slot,
      sourceMatrix
        ? new Matrix4().multiplyMatrices(placement.matrix, sourceMatrix)
        : placement.matrix,
    )
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  return mesh
}
