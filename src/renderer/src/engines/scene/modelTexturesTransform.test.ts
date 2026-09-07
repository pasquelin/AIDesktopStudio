import { Mesh, MeshStandardMaterial, MirroredRepeatWrapping, NearestFilter, Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { geometryFor } from './threeFactory'
import { scriptedTextureCache } from './scene-fixtures'
import { createModelTextures } from './modelTextures'

describe('model texture transforms', () => {
  it('keeps a different transform on each extracted map', async () => {
    const material = new MeshStandardMaterial()
    const root = new Object3D()
    const mesh = new Mesh(geometryFor({ kind: 'box', width: 1, height: 1, depth: 1 }), material)
    root.add(mesh)
    const scripted = scriptedTextureCache()
    const textures = createModelTextures(scripted.cache, root, vi.fn())

    textures.apply(0, {
      map: {
        assetId: 'albedo',
        transform: {
          tiling: { x: 2, y: 3 },
          offset: { x: 0.25, y: 0.5 },
          rotation: 0.4,
        },
      },
      normalMap: {
        assetId: 'normal',
        transform: {
          tiling: { x: 1, y: 1 },
          offset: { x: 0, y: 0 },
          rotation: 0,
        },
      },
    })
    await scripted.settle('albedo')
    await scripted.settle('normal')

    const worn = mesh.material
    if (!(worn instanceof MeshStandardMaterial)) throw new Error('expected a standard material')
    expect(worn.map?.repeat.toArray()).toEqual([2, 3])
    expect(worn.map?.offset.toArray()).toEqual([0.25, 0.5])
    expect(worn.map?.rotation).toBe(0.4)
    expect(worn.normalMap?.repeat.toArray()).toEqual([1, 1])
  })

  it('restores the glTF UV set, wrapping and filtering without the source texture', async () => {
    const material = new MeshStandardMaterial()
    const root = new Object3D()
    const mesh = new Mesh(geometryFor({ kind: 'box', width: 1, height: 1, depth: 1 }), material)
    root.add(mesh)
    const scripted = scriptedTextureCache()
    const textures = createModelTextures(scripted.cache, root, vi.fn())

    textures.apply(0, {
      map: {
        assetId: 'albedo',
        sampling: {
          channel: 1,
          wrapS: 33648,
          wrapT: 33648,
          minFilter: 9728,
          magFilter: 9728,
        },
      },
    })
    await scripted.settle('albedo')

    const worn = mesh.material
    if (!(worn instanceof MeshStandardMaterial)) throw new Error('expected a standard material')
    expect(worn.map?.channel).toBe(1)
    expect(worn.map?.wrapS).toBe(MirroredRepeatWrapping)
    expect(worn.map?.wrapT).toBe(MirroredRepeatWrapping)
    expect(worn.map?.minFilter).toBe(NearestFilter)
    expect(worn.map?.magFilter).toBe(NearestFilter)
  })
})
