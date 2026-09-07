import {
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createModelTextures } from './modelTextures'
import { scriptedTextureCache } from './scene-fixtures'
import { instanceOf } from './modelCache'
import { geometryFor } from './threeFactory'

function loadedModel(): { source: Object3D; fileMap: Texture } {
  const fileMap = new Texture()
  const material = new MeshStandardMaterial()
  material.map = fileMap

  const source = new Object3D()
  source.add(new Mesh(geometryFor({ kind: 'box', width: 1, height: 1, depth: 1 }), material))
  return { source, fileMap }
}

function materialOf(root: Object3D): MeshStandardMaterial {
  let found: MeshStandardMaterial | null = null
  root.traverse(object => {
    if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) {
      found = found ?? object.material
    }
  })
  if (!found) throw new Error('the fixture builds one standard material')
  return found
}

function twoMaterialModel(): Object3D {
  const source = new Object3D()
  for (let made = 0; made < 2; made += 1) {
    const geometry = geometryFor({ kind: 'box', width: 1, height: 1, depth: 1 })
    source.add(new Mesh(geometry, new MeshStandardMaterial()))
  }
  return source
}

/** Every standard material of an instance, in the order a traversal meets them. */
function materialsOf(root: Object3D): MeshStandardMaterial[] {
  const found: MeshStandardMaterial[] = []
  root.traverse(object => {
    if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) {
      found.push(object.material)
    }
  })
  return found
}

let onChange: () => void

beforeEach(() => {
  onChange = vi.fn()
})

describe('createModelTextures', () => {
  it('reports material names in the same order as their editable slots', () => {
    const scripted = scriptedTextureCache()
    const source = twoMaterialModel()
    const materials = materialsOf(source)
    if (materials[0]) materials[0].name = 'Coat'
    if (materials[1]) materials[1].name = 'Glass'

    const textures = createModelTextures(scripted.cache, instanceOf(source), onChange)

    expect(textures.names()).toEqual(['Coat', 'Glass'])
  })

  it('reports glTF material indices in runtime slot order', () => {
    const scripted = scriptedTextureCache()
    const source = twoMaterialModel()
    const materials = materialsOf(source)
    if (materials[0]) materials[0].userData.gltfMaterialIndex = 3
    if (materials[1]) materials[1].userData.gltfMaterialIndex = 1

    const textures = createModelTextures(scripted.cache, instanceOf(source), onChange)

    expect(textures.sourceIndices()).toEqual([3, 1])
  })

  it('reports each mesh as a part of the same model root', () => {
    const scripted = scriptedTextureCache()
    const source = twoMaterialModel()
    const meshes = source.children.filter(child => child instanceof Mesh)
    if (meshes[0]) meshes[0].name = 'Hair'
    if (meshes[1]) meshes[1].name = 'Head'

    const textures = createModelTextures(scripted.cache, instanceOf(source), onChange)

    expect(textures.parts()).toEqual([
      { id: 'mesh-0', name: 'Hair', materialSlots: [0] },
      { id: 'mesh-1', name: 'Head', materialSlots: [1] },
    ])
  })

  it('puts the project picture over the map the file carries', async () => {
    const scripted = scriptedTextureCache()
    const { source } = loadedModel()
    const instance = instanceOf(source)
    const textures = createModelTextures(scripted.cache, instance, onChange)

    textures.apply(0, { map: { assetId: 'tex-1' } })
    const loaded = await scripted.settle('tex-1')

    // The SOURCE, not the instance: an override wears the sampler of the map it replaces, so
    // what lands on the material is a clone sharing the picture — see `sampledLike`.
    expect(materialOf(instance).map?.source).toBe(loaded?.source)
    expect(scripted.spaces.get('tex-1')).toBe(SRGBColorSpace)
    expect(onChange).toHaveBeenCalled()
  })

  it('leaves the other instances of the same file alone', async () => {
    const scripted = scriptedTextureCache()
    const { source, fileMap } = loadedModel()
    const dressed = instanceOf(source)
    const untouched = instanceOf(source)
    const textures = createModelTextures(scripted.cache, dressed, onChange)

    textures.apply(0, { map: { assetId: 'tex-1' } })
    const loaded = await scripted.settle('tex-1')

    expect(materialOf(dressed).map?.source).toBe(loaded?.source)
    expect(materialOf(untouched).map).toBe(fileMap)
    expect(materialOf(source).map).toBe(fileMap)
  })

  it('puts the file own map back when the override is removed', async () => {
    const scripted = scriptedTextureCache()
    const { source, fileMap } = loadedModel()
    const instance = instanceOf(source)
    const textures = createModelTextures(scripted.cache, instance, onChange)

    textures.apply(0, { map: { assetId: 'tex-1' } })
    await scripted.settle('tex-1')
    textures.apply(0, {})

    expect(scripted.released).toEqual(['tex-1'])
    expect(materialOf(instance).map).toBe(fileMap)
  })

  it('removes the file map in textureless mode and restores it when that mode ends', () => {
    const scripted = scriptedTextureCache()
    const { source, fileMap } = loadedModel()
    const instance = instanceOf(source)
    const textures = createModelTextures(scripted.cache, instance, onChange)

    textures.fileTextures(false)
    textures.apply(0, {})
    expect(materialOf(instance).map).toBeNull()

    textures.fileTextures(true)
    textures.apply(0, {})
    expect(materialOf(instance).map).toBe(fileMap)
  })

  it('cannot restore a file map after its source was extracted', () => {
    const { source } = loadedModel()
    const instance = instanceOf(source)
    const textures = createModelTextures(scriptedTextureCache().cache, instance, onChange)

    textures.detachFileTextures()
    textures.fileTextures(true)
    textures.apply(0, {})

    expect(materialOf(instance).map).toBeNull()
  })

  it('reports that extraction consumed its file textures', () => {
    const { source } = loadedModel()
    const textures = createModelTextures(scriptedTextureCache().cache, instanceOf(source), onChange)

    expect(textures.hasFileTextures()).toBe(true)

    textures.detachFileTextures()

    expect(textures.hasFileTextures()).toBe(false)
  })

  it('removes and restores a texture carried by an unlit glTF material', () => {
    const scripted = scriptedTextureCache()
    const fileMap = new Texture()
    const material = new MeshBasicMaterial({ map: fileMap })
    const source = new Object3D()
    source.add(new Mesh(geometryFor({ kind: 'box', width: 1, height: 1, depth: 1 }), material))
    const instance = instanceOf(source)
    const textures = createModelTextures(scripted.cache, instance, onChange)
    const object = instance.children[0]
    if (!(object instanceof Mesh) || !(object.material instanceof MeshBasicMaterial)) {
      throw new Error('the fixture builds one unlit material')
    }
    const clone = object.material

    textures.fileTextures(false)
    expect(clone.map).toBeNull()

    textures.fileTextures(true)
    expect(clone.map).toBe(fileMap)
  })

  it('removes and restores extension maps carried by a physical material', () => {
    const scripted = scriptedTextureCache()
    const clearcoatMap = new Texture()
    const material = new MeshPhysicalMaterial({ clearcoatMap })
    const source = new Object3D()
    source.add(new Mesh(geometryFor({ kind: 'box', width: 1, height: 1, depth: 1 }), material))
    const instance = instanceOf(source)
    const textures = createModelTextures(scripted.cache, instance, onChange)
    const clone = materialOf(instance)

    textures.fileTextures(false)
    expect(clone).toBeInstanceOf(MeshPhysicalMaterial)
    expect(Reflect.get(clone, 'clearcoatMap')).toBeNull()

    textures.fileTextures(true)
    expect(Reflect.get(clone, 'clearcoatMap')).toBe(clearcoatMap)
  })

  it('gives every reference back when the node goes', async () => {
    const scripted = scriptedTextureCache()
    const { source, fileMap } = loadedModel()
    const instance = instanceOf(source)
    const textures = createModelTextures(scripted.cache, instance, onChange)

    textures.apply(0, { map: { assetId: 'a' }, normalMap: { assetId: 'b' } })
    await scripted.settle('a')
    textures.dispose()

    expect(scripted.released.sort()).toEqual(['a', 'b'])
    expect(materialOf(instance).map).toBe(fileMap)
  })

  it('disposes the cloned materials, not the ones the file still holds', () => {
    const scripted = scriptedTextureCache()
    const { source } = loadedModel()
    const instance = instanceOf(source)
    const textures = createModelTextures(scripted.cache, instance, onChange)
    const clone = materialOf(instance)
    const file = materialOf(source)
    const disposeClone = vi.spyOn(clone, 'dispose')
    const disposeFile = vi.spyOn(file, 'dispose')

    textures.dispose()

    expect(disposeClone).toHaveBeenCalledOnce()
    expect(disposeFile).not.toHaveBeenCalled()
  })

  /**
   * Taken at build time rather than at the first override, and the display modes are why: one
   * swaps `mesh.material` for a stand-in shared by the whole scene, so a late copy would clone the
   * CLAY and hand `PaneMemory` a material it takes for the model's own.
   */
  it('takes its own copy of the materials as soon as the file lands', () => {
    const scripted = scriptedTextureCache()
    const { source } = loadedModel()
    const instance = instanceOf(source)
    const shared = materialOf(instance)

    createModelTextures(scripted.cache, instance, onChange)

    expect(materialOf(instance)).not.toBe(shared)
    expect(materialOf(source)).toBe(shared)
  })

  // `KHR_materials_unlit` brings a `MeshBasicMaterial`, which has no slot to write into. The
  // inspector still offers five of them, so the refusal is said rather than left silent.
  it('says so when the model carries nothing a map can be written into', () => {
    const scripted = scriptedTextureCache()
    const unlit = new Object3D()
    unlit.add(new Mesh(geometryFor({ kind: 'box', width: 1, height: 1, depth: 1 })))
    const undressable = vi.fn()

    createModelTextures(scripted.cache, unlit, onChange, undressable).apply(0, {
      map: { assetId: 'tex-1' },
    })

    expect(undressable).toHaveBeenCalled()
  })

  /**
   * glTF stores its UVs for an unflipped picture, and `GLTFLoader` configures no orientation —
   * asked the studio's own way up, an override lands upside down over the map it replaces.
   */
  it('asks for its pictures the way up the model file stores them', async () => {
    const scripted = scriptedTextureCache()
    const { source } = loadedModel()
    const instance = instanceOf(source)

    createModelTextures(scripted.cache, instance, onChange).apply(0, {
      map: { assetId: 'tex-base' },
    })
    await scripted.settle('tex-base')

    expect(scripted.orientations.get('tex-base')).toBe('from-image')
  })

  /**
   * A `.glb` whose map tiles says so on the SAMPLER, not in the picture. Posted bare, an override
   * reverted every model to ClampToEdge at 1×1 — a slot at a time it was rare, the button that
   * fills five at once makes it a single click.
   */
  it('dresses the override with the sampler of the map it replaces', async () => {
    const scripted = scriptedTextureCache()
    const { source, fileMap } = loadedModel()
    fileMap.wrapS = RepeatWrapping
    fileMap.wrapT = RepeatWrapping
    fileMap.repeat.set(4, 2)
    fileMap.offset.set(0.25, 0.5)
    fileMap.channel = 1
    const instance = instanceOf(source)

    createModelTextures(scripted.cache, instance, onChange).apply(0, {
      map: { assetId: 'tex-base' },
    })
    await scripted.settle('tex-base')

    const worn = materialOf(instance).map
    expect(worn?.repeat.toArray()).toEqual([4, 2])
    expect(worn?.offset.toArray()).toEqual([0.25, 0.5])
    expect(worn?.wrapS).toBe(RepeatWrapping)
    expect(worn?.channel).toBe(1)
  })

  /**
   * The clone carries its own wrapping, and `getTextureCacheKey` reads it — so three allocates a
   * SECOND GPU texture for it, one the cache never hears about. Left alone, every ⌘S on the
   * picture and every reopening of the scene grew `info.memory.textures` for the session.
   */
  it('frees the clone it wore when the model goes away', async () => {
    const scripted = scriptedTextureCache()
    const { source, fileMap } = loadedModel()
    fileMap.repeat.set(2, 2)
    const instance = instanceOf(source)
    const textures = createModelTextures(scripted.cache, instance, onChange)

    textures.apply(0, { map: { assetId: 'tex-base' } })
    await scripted.settle('tex-base')
    const worn = materialOf(instance).map
    const freed = vi.spyOn(worn as Texture, 'dispose')

    textures.dispose()

    expect(freed).toHaveBeenCalled()
  })

  /**
   * The finish a material of the Materials space is worth to a model. Absent fields leave what the
   * glTF put there — a model dressed by half a finish keeps the other half of its file.
   */
  it('wears the finish over the one its file carries', () => {
    const scripted = scriptedTextureCache()
    const { source } = loadedModel()
    const instance = instanceOf(source)
    materialOf(instance).roughness = 0.9

    createModelTextures(scripted.cache, instance, onChange).dress(0, { metalness: 0.5 })

    expect(materialOf(instance).metalness).toBe(0.5)
    expect(materialOf(instance).roughness).toBe(0.9)
  })

  // The repeat rides on the TEXTURES, not on the material: one tiling turns every map at once.
  it('tiles the maps rather than the material', () => {
    const scripted = scriptedTextureCache()
    const { source, fileMap } = loadedModel()
    const instance = instanceOf(source)

    createModelTextures(scripted.cache, instance, onChange).dress(0, { tiling: { x: 4, y: 2 } })

    expect(fileMap.repeat.toArray()).toEqual([4, 2])
  })
})

/**
 * A model carries one material per primitive of its mesh — Blender's slots, Unreal's elements —
 * and the studio dressed ALL of them with whatever the node named. A car was then a body, a glass
 * and a set of tyres painted the same.
 */
describe('a model of several materials', () => {
  it('counts the materials its file carries', () => {
    const instance = instanceOf(twoMaterialModel())
    const textures = createModelTextures(scriptedTextureCache().cache, instance, onChange)

    expect(textures.count()).toBe(2)
  })

  it('dresses one slot without touching the others', async () => {
    const scripted = scriptedTextureCache()
    const instance = instanceOf(twoMaterialModel())
    const textures = createModelTextures(scripted.cache, instance, onChange)

    textures.apply(1, { map: { assetId: 'tex-1' } })
    const loaded = await scripted.settle('tex-1')

    const [first, second] = materialsOf(instance)
    expect(second?.map?.source).toBe(loaded?.source)
    expect(first?.map).toBeNull()
  })

  it('gives each slot the finish of its own material', () => {
    const instance = instanceOf(twoMaterialModel())
    const textures = createModelTextures(scriptedTextureCache().cache, instance, onChange)

    textures.dress(0, { roughness: 0.2 })
    textures.dress(1, { roughness: 0.9 })

    expect(materialsOf(instance).map(one => one.roughness)).toEqual([0.2, 0.9])
  })

  // A slot the file does not have is a row the user added ahead of its model: it does nothing,
  // and it must not write into the last material that does exist.
  it('writes nothing for a slot the file does not carry', async () => {
    const scripted = scriptedTextureCache()
    const instance = instanceOf(twoMaterialModel())
    const textures = createModelTextures(scripted.cache, instance, onChange)

    textures.apply(5, { map: { assetId: 'tex-1' } })
    await Promise.resolve()

    expect(materialsOf(instance).every(one => one.map === null)).toBe(true)
  })
})

/**
 * A glTF material is routinely worn by SEVERAL primitives. A slot per *(mesh, material)* pair made
 * a file of one material report five, so dressing « slot 0 » left four meshes on their own maps —
 * and every scene saved before the two modes existed reopened under-dressed, in silence.
 */
describe('a material several meshes share', () => {
  function sharedMaterialModel(): Object3D {
    const material = new MeshStandardMaterial()
    const source = new Object3D()
    for (let made = 0; made < 3; made += 1) {
      const geometry = geometryFor({ kind: 'box', width: 1, height: 1, depth: 1 })
      source.add(new Mesh(geometry, material))
    }
    return source
  }

  it('counts one slot, not one per mesh', () => {
    const instance = instanceOf(sharedMaterialModel())
    const textures = createModelTextures(scriptedTextureCache().cache, instance, onChange)

    expect(textures.count()).toBe(1)
  })

  it('dresses every mesh wearing it from that one slot', async () => {
    const scripted = scriptedTextureCache()
    const instance = instanceOf(sharedMaterialModel())
    const textures = createModelTextures(scripted.cache, instance, onChange)

    textures.apply(0, { map: { assetId: 'tex-1' } })
    const loaded = await scripted.settle('tex-1')

    const worn = materialsOf(instance)
    expect(worn).toHaveLength(3)
    expect(worn.every(one => one.map?.source === loaded?.source)).toBe(true)
  })
})

/**
 * Covering a model with a picture names no finish at all, and the clone still carried whatever the
 * material before it wrote: a model that wore a red material kept the red multiplying its new base
 * colour until the engine was rebuilt.
 */
describe('a finish a dress no longer names', () => {
  it('puts back the one the file gave the material', () => {
    const { source } = loadedModel()
    materialOf(source).color.set('#204080')
    const instance = instanceOf(source)
    const textures = createModelTextures(scriptedTextureCache().cache, instance, onChange)

    textures.dress(0, { color: '#ff0000' })
    textures.dress(0, undefined)

    expect(`#${materialOf(instance).color.getHexString()}`).toBe('#204080')
  })

  it('leaves the program alone when nothing moved', () => {
    const instance = instanceOf(loadedModel().source)
    const textures = createModelTextures(scriptedTextureCache().cache, instance, onChange)

    textures.dress(0, { roughness: 0.4 })
    const material = materialOf(instance)
    const before = material.version
    textures.dress(0, { roughness: 0.4 })

    expect(material.version).toBe(before)
  })
})
