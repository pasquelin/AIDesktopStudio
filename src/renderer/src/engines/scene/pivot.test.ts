import { Object3D, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  applyTransform,
  carry,
  centreOf,
  placePivot,
  release,
  standsAt,
  transformOf,
} from './pivot'

function node(id: string, x: number, y = 0, z = 0): Object3D {
  const object = new Object3D()
  object.name = id
  object.position.set(x, y, z)
  return object
}

function sceneOf(...objects: Object3D[]): Object3D {
  const scene = new Object3D()
  scene.add(...objects)
  return scene
}

describe('centreOf', () => {
  it('averages where the objects stand', () => {
    const centre = centreOf([node('a', 0), node('b', 4)], new Vector3())
    expect(centre.x).toBeCloseTo(2)
  })

  it('is the origin for an empty selection rather than a NaN', () => {
    expect(centreOf([], new Vector3()).toArray()).toEqual([0, 0, 0])
  })
})

describe('placePivot', () => {
  it('sits at the centre of the selection', () => {
    const pivot = new Object3D()
    placePivot(pivot, [node('a', 0), node('b', 6)])

    expect(pivot.position.x).toBeCloseTo(3)
  })

  it('comes back square with the world, whatever the last drag left it at', () => {
    const pivot = new Object3D()
    pivot.rotation.set(1, 1, 1)
    pivot.scale.set(3, 3, 3)

    placePivot(pivot, [node('a', 0)])

    expect(pivot.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0])
    expect(pivot.scale.toArray()).toEqual([1, 1, 1])
  })

  // Without this the local-frame toggle would light up over a group and change nothing.
  it('takes the anchor’s orientation when one is given', () => {
    const anchor = node('b', 4)
    anchor.rotation.y = Math.PI / 4
    const pivot = new Object3D()

    placePivot(pivot, [node('a', 0), anchor], anchor)

    expect(pivot.rotation.y).toBeCloseTo(Math.PI / 4)
    expect(pivot.position.x).toBeCloseTo(2)
  })

  it('still scales to one, so a turned anchor never stretches the group', () => {
    const anchor = node('b', 0)
    anchor.scale.set(4, 4, 4)
    const pivot = new Object3D()

    placePivot(pivot, [anchor], anchor)

    expect(pivot.scale.toArray()).toEqual([1, 1, 1])
  })
})

describe('carry and release', () => {
  it('moves every carried node by what the pivot was moved by', () => {
    const [a, b] = [node('a', 0), node('b', 4)]
    const pivot = new Object3D()
    const scene = sceneOf(a, b, pivot)

    placePivot(pivot, [a, b])
    carry(pivot, [a, b], scene)
    pivot.position.x += 10

    const moves = release(pivot, scene)
    expect(moves?.map(move => move.id)).toEqual(['a', 'b'])
    expect(moves?.[0]?.transform.position.x).toBeCloseTo(10)
    expect(moves?.[1]?.transform.position.x).toBeCloseTo(14)
  })

  it('turns the group around its centre rather than around each node', () => {
    const [a, b] = [node('a', -2), node('b', 2)]
    const pivot = new Object3D()
    const scene = sceneOf(a, b, pivot)

    placePivot(pivot, [a, b])
    carry(pivot, [a, b], scene)
    // A half turn about Y: the two nodes swap sides, and the centre does not move.
    pivot.rotation.y = Math.PI

    const moves = release(pivot, scene)
    expect(moves?.[0]?.transform.position.x).toBeCloseTo(2)
    expect(moves?.[1]?.transform.position.x).toBeCloseTo(-2)
  })

  it('hands every node back to the scene, so nothing stays parented to the pivot', () => {
    const a = node('a', 0)
    const pivot = new Object3D()
    const scene = sceneOf(a, pivot)

    carry(pivot, [a], scene)
    expect(a.parent).toBe(pivot)

    release(pivot, scene)
    expect(a.parent).toBe(scene)
    expect(pivot.children).toEqual([])
  })

  // A node deleted mid-drag is detached from the pivot; handing it back would resurrect it.
  it('reports only what the pivot is still carrying', () => {
    const [a, b] = [node('a', 0), node('b', 4)]
    const pivot = new Object3D()
    const scene = sceneOf(a, b, pivot)

    carry(pivot, [a, b], scene)
    b.removeFromParent()

    expect(release(pivot, scene)?.map(move => move.id)).toEqual(['a'])
    expect(b.parent).toBeNull()
  })

  it('reports nothing when the pivot carries nothing', () => {
    const pivot = new Object3D()
    expect(release(pivot, sceneOf(pivot))).toBeNull()
  })
})

describe('transformOf', () => {
  it('reads the three parts a document stores', () => {
    const object = node('a', 1, 2, 3)
    object.rotation.set(0.1, 0.2, 0.3)
    object.scale.set(2, 3, 4)

    expect(transformOf(object)).toEqual({
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0.1, y: 0.2, z: 0.3 },
      scale: { x: 2, y: 3, z: 4 },
    })
  })
})

/**
 * The way back, and it had no test at all while four sites leaned on it — the fourth being the
 * bone poses of `SceneRenderer`, which wrote the nine `.set()` arguments out by hand until the
 * clone report named it.
 *
 * Asserted through `transformOf` rather than on the three vectors: what the pair owes a caller
 * is that a transform read out and written back is the same transform, which is exactly what
 * the renderer does with a bone's rest pose.
 */
describe('standsAt', () => {
  it('answers true only when the object already holds that pose', () => {
    const object = node('crate', 1, 2, 3)
    const held = transformOf(object)

    expect(standsAt(object, held)).toBe(true)
    expect(standsAt(object, { ...held, position: { ...held.position, x: 9 } })).toBe(false)
  })
})

describe('applyTransform', () => {
  it('writes back what transformOf read, part for part', () => {
    const source = node('a', 1, 2, 3)
    source.rotation.set(0.1, 0.2, 0.3)
    source.scale.set(2, 3, 4)
    const target = node('b', 9, 9, 9)

    applyTransform(target, transformOf(source))

    expect(transformOf(target)).toEqual(transformOf(source))
  })
})
