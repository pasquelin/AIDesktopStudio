import { BoxGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { morphNamesOf, setMorphInfluenceOn } from './modelMorphs'

/** A mesh carrying the targets named, the way `GLTFLoader` hands one back. */
function morphed(...names: string[]): Mesh {
  const geometry = new BoxGeometry()
  geometry.morphAttributes.position = names.map(
    () =>
      new Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3), 3),
  )
  const mesh = new Mesh(geometry, new MeshStandardMaterial())
  mesh.updateMorphTargets()
  mesh.morphTargetDictionary = Object.fromEntries(names.map((name, index) => [name, index]))
  return mesh
}

describe('the morph targets of a loaded model', () => {
  it('names each target once across the meshes that carry it, and none for a plain mesh', () => {
    const root = new Object3D()
    root.add(morphed('smile', 'blink'), morphed('smile'), new Mesh(new BoxGeometry()))

    expect(morphNamesOf(root)).toEqual(['smile', 'blink'])
    expect(morphNamesOf(new Mesh(new BoxGeometry()))).toEqual([])
  })

  it('writes a weight on every mesh carrying the target, and says when none does', () => {
    const face = morphed('smile', 'blink')
    const body = morphed('smile')
    const root = new Object3D().add(face, body)

    expect(setMorphInfluenceOn(root, 'smile', 0.75)).toBe(true)
    expect(face.morphTargetInfluences).toEqual([0.75, 0])
    expect(body.morphTargetInfluences).toEqual([0.75])
    expect(setMorphInfluenceOn(root, 'frown', 1)).toBe(false)
  })
})
