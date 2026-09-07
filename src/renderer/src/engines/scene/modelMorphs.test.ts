import { BoxGeometry, Mesh, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { morphNamesOf, setMorphInfluencesOn } from './modelMorphs'
import { morphedMesh } from './scene-fixtures'

describe('the morph targets of a loaded model', () => {
  it('names each target once across the meshes that carry it, and none for a plain mesh', () => {
    const root = new Object3D()
    root.add(morphedMesh('smile', 'blink'), morphedMesh('smile'), new Mesh(new BoxGeometry()))

    expect(morphNamesOf(root)).toEqual(['smile', 'blink'])
    expect(morphNamesOf(new Mesh(new BoxGeometry()))).toEqual([])
  })

  it('writes each weight on every mesh carrying its target, and counts what landed', () => {
    const face = morphedMesh('smile', 'blink')
    const body = morphedMesh('smile')
    const root = new Object3D().add(face, body)

    expect(setMorphInfluencesOn(root, { smile: 0.75, blink: 0.2 })).toBe(3)
    expect(face.morphTargetInfluences).toEqual([0.75, 0.2])
    expect(body.morphTargetInfluences).toEqual([0.75])
    expect(setMorphInfluencesOn(root, { frown: 1 })).toBe(0)
  })
})
