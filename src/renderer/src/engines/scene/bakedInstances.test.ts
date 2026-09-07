import { BoxGeometry, Matrix4, MeshStandardMaterial } from 'three'
import { expect, it } from 'vitest'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { bakedInstancesOf } from './bakedInstances'

it('draws every baked source at its authored transform and keeps its identity mapping', () => {
  const mesh = bakedInstancesOf(new BoxGeometry(), new MeshStandardMaterial(), [
    { sourceId: 'first', name: 'First', transform: IDENTITY_TRANSFORM },
    {
      sourceId: 'second',
      name: 'Second',
      transform: { ...IDENTITY_TRANSFORM, position: { x: 4, y: 2, z: -1 } },
    },
  ])
  const placement = new Matrix4()
  mesh.getMatrixAt(1, placement)

  expect(mesh.count).toBe(2)
  expect(placement.elements.slice(12, 15)).toEqual([4, 2, -1])
})
