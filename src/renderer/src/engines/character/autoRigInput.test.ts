import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { autoRigInputFor } from './autoRigInput'

const triangle = (): Mesh => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
  geometry.setIndex([0, 1, 2])
  return new Mesh(geometry)
}

describe('Auto Rig inference geometry', () => {
  it('concatenates distinct meshes without losing their primitive ranges', async () => {
    const root = new Group()
    root.add(triangle(), triangle())

    const input = await autoRigInputFor(root)

    expect(input?.primitives).toEqual([
      { mesh: 0, primitive: 0, vertexOffset: 0, vertexCount: 3 },
      { mesh: 1, primitive: 0, vertexOffset: 3, vertexCount: 3 },
    ])
    expect(Array.from(input?.triangles ?? [])).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('stages vertices in model space when child meshes have local transforms', async () => {
    const root = new Group()
    const moved = triangle()
    moved.position.set(4, 5, 6)
    root.add(moved)
    root.updateWorldMatrix(false, true)

    const input = await autoRigInputFor(root)

    expect(Array.from(input?.positions ?? [])).toEqual([4, 5, 6, 5, 5, 6, 4, 6, 6])
  })

  it('stops staging before inference when the task is cancelled', async () => {
    const root = new Group()
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(32_769 * 3, 3))
    root.add(new Mesh(geometry))
    const stop = new AbortController()

    await expect(
      autoRigInputFor(
        root,
        async () => {
          stop.abort()
        },
        stop.signal,
      ),
    ).rejects.toThrow('CANCELLED')
  })
})
