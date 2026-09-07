import {
  BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  SRGBColorSpace,
  SpriteMaterial,
} from 'three'
import type { MaterialDescriptor, SpriteDescriptor, TextureSlot } from '@shared/domain/scene'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMaterialTextures, createSpriteTexture } from './materialTextures'
import { scriptedTextureCache } from './scene-fixtures'
import { DEFAULT_MATERIAL, DEFAULT_SPRITE } from './sceneState'
import { geometryFor } from './threeFactory'

const withMap = (assetId: string | null): MaterialDescriptor => ({
  ...DEFAULT_MATERIAL,
  map: assetId ? { assetId } : null,
})

let mesh: Mesh
let material: MeshStandardMaterial
let onMaterialChange: (slot: TextureSlot) => void
let onSpriteChange: () => void

beforeEach(() => {
  material = new MeshStandardMaterial()
  mesh = new Mesh(geometryFor({ kind: 'box', width: 1, height: 1, depth: 1 }), material)
  onMaterialChange = vi.fn()
  onSpriteChange = vi.fn()
})

describe('createMaterialTextures', () => {
  it('installs textures and identifies the slot that changed', async () => {
    const scripted = scriptedTextureCache()
    const textures = createMaterialTextures(scripted.cache, mesh, material, onMaterialChange)

    textures.apply({
      ...DEFAULT_MATERIAL,
      map: { assetId: 'tex-1' },
      displacementMap: { assetId: 'height-1' },
    })
    const texture = await scripted.settle('tex-1')
    const height = await scripted.settle('height-1')

    expect(material.map).toBe(texture)
    expect(material.displacementMap).toBe(height)
    expect(onMaterialChange).toHaveBeenNthCalledWith(1, 'map')
    expect(onMaterialChange).toHaveBeenNthCalledWith(2, 'displacementMap')
  })

  it('asks for nothing again while the slot has not moved', () => {
    const scripted = scriptedTextureCache()
    const textures = createMaterialTextures(scripted.cache, mesh, material, onMaterialChange)

    textures.apply(withMap('tex-1'))
    textures.apply(withMap('tex-1'))

    expect(scripted.acquired).toEqual(['tex-1'])
  })

  it('gives the reference back when a slot is emptied', async () => {
    const scripted = scriptedTextureCache()
    const textures = createMaterialTextures(scripted.cache, mesh, material, onMaterialChange)

    textures.apply(withMap('tex-1'))
    await scripted.settle('tex-1')
    textures.apply(withMap(null))

    expect(scripted.released).toEqual(['tex-1'])
    expect(material.map).toBeNull()
  })

  // Three textures picked in a row: the first to arrive must not overwrite the third.
  it('drops an arrival the slot has moved on from', async () => {
    const scripted = scriptedTextureCache()
    const textures = createMaterialTextures(scripted.cache, mesh, material, onMaterialChange)

    textures.apply(withMap('tex-1'))
    textures.apply(withMap('tex-2'))
    textures.apply(withMap('tex-3'))

    const third = await scripted.settle('tex-3')
    await scripted.settle('tex-1')
    await scripted.settle('tex-2')

    expect(material.map).toBe(third)
  })

  it('takes and gives back one reference per change of mind', () => {
    const scripted = scriptedTextureCache()
    const textures = createMaterialTextures(scripted.cache, mesh, material, onMaterialChange)

    textures.apply(withMap('tex-1'))
    textures.apply(withMap('tex-2'))
    textures.apply(withMap('tex-1'))

    expect(scripted.acquired).toEqual(['tex-1', 'tex-2', 'tex-1'])
    expect(scripted.released).toEqual(['tex-1', 'tex-2'])
  })

  // A texture released mid-load resolves to nothing: nothing must be installed.
  it('installs nothing when the load came back empty', async () => {
    const scripted = scriptedTextureCache()
    const textures = createMaterialTextures(scripted.cache, mesh, material, onMaterialChange)

    textures.apply(withMap('tex-1'))
    await scripted.settle('tex-1', null)

    expect(material.map).toBeNull()
  })

  // The colour space is asked of the cache rather than written onto the texture: the same asset
  // can dress one slot as colour and another as data, and they must not share one instance.
  it('asks for the base map as sRGB and the data maps as data', async () => {
    const scripted = scriptedTextureCache()
    const textures = createMaterialTextures(scripted.cache, mesh, material, onMaterialChange)

    textures.apply({
      ...DEFAULT_MATERIAL,
      map: { assetId: 'colour' },
      normalMap: { assetId: 'normal' },
    })
    await scripted.settle('colour')
    await scripted.settle('normal')

    expect(scripted.spaces.get('colour')).toBe(SRGBColorSpace)
    expect(scripted.spaces.get('normal')).toBe(NoColorSpace)
  })

  // Without a second UV set, ambient occlusion is a slot that quietly does nothing.
  it('gives the geometry a second UV set for an occlusion map', async () => {
    const scripted = scriptedTextureCache()
    const textures = createMaterialTextures(scripted.cache, mesh, material, onMaterialChange)
    expect(mesh.geometry.attributes.uv1).toBeUndefined()

    textures.apply({ ...DEFAULT_MATERIAL, aoMap: { assetId: 'ao' } })
    await scripted.settle('ao')

    expect(mesh.geometry.attributes.uv1).toBe(mesh.geometry.attributes.uv)
  })

  it('leaves a second UV set the geometry already had alone', async () => {
    const own = new BufferAttribute(new Float32Array(48), 2)
    mesh.geometry.setAttribute('uv1', own)
    const scripted = scriptedTextureCache()
    const textures = createMaterialTextures(scripted.cache, mesh, material, onMaterialChange)

    textures.apply({ ...DEFAULT_MATERIAL, aoMap: { assetId: 'ao' } })
    await scripted.settle('ao')

    expect(mesh.geometry.attributes.uv1).toBe(own)
  })

  /**
   * The last link of « edit the picture and the model follows »: ⌘S rewrites the file behind an
   * id that never moves, so a slot comparing ids alone kept the image the edit replaced.
   */
  it('loads the picture again when the catalogue says it was rewritten', async () => {
    const scripted = scriptedTextureCache()
    const textures = createMaterialTextures(scripted.cache, mesh, material, onMaterialChange)

    scripted.versions.set('tex-1', 'before')
    textures.apply(withMap('tex-1'))
    const before = await scripted.settle('tex-1')

    scripted.versions.set('tex-1', 'after')
    textures.apply(withMap('tex-1'))

    // What is on screen stays until the new version has decoded, and the old reference goes back
    // only then: a ⌘S over a texture must not flash the mesh bare, nor draw a freed texture.
    expect(material.map).toBe(before)
    expect(scripted.released).toEqual([])

    const after = await scripted.settle('tex-1')
    expect(scripted.acquired).toEqual(['tex-1', 'tex-1'])
    expect(scripted.released).toEqual(['tex-1'])
    expect(material.map).toBe(after)
  })

  /**
   * The shelf is scoped by type and empty until its first read lands, so it legitimately says
   * nothing about a picture a slot names. Re-asking then would fetch the BARE URL — exactly where
   * the stale bitmap sits in the browser's cache — and trade a fresh texture for the old one.
   */
  it('keeps the texture it holds when the catalogue says nothing about it', async () => {
    const scripted = scriptedTextureCache()
    const textures = createMaterialTextures(scripted.cache, mesh, material, onMaterialChange)

    scripted.versions.set('tex-1', 'known')
    textures.apply(withMap('tex-1'))
    const loaded = await scripted.settle('tex-1')

    scripted.versions.delete('tex-1')
    textures.apply(withMap('tex-1'))

    expect(scripted.acquired).toEqual(['tex-1'])
    expect(material.map).toBe(loaded)
  })

  it('asks for nothing again when the picture has not been rewritten', () => {
    const scripted = scriptedTextureCache()
    const textures = createMaterialTextures(scripted.cache, mesh, material, onMaterialChange)

    scripted.versions.set('tex-1', 'stable')
    textures.apply(withMap('tex-1'))
    textures.apply(withMap('tex-1'))

    expect(scripted.acquired).toEqual(['tex-1'])
  })

  it('gives every reference back when the mesh goes', async () => {
    const scripted = scriptedTextureCache()
    const textures = createMaterialTextures(scripted.cache, mesh, material, onMaterialChange)

    textures.apply({ ...DEFAULT_MATERIAL, map: { assetId: 'a' }, aoMap: { assetId: 'b' } })
    await scripted.settle('a')
    textures.dispose()

    expect(scripted.released.sort()).toEqual(['a', 'b'])
    expect(material.map).toBeNull()
  })
})

describe('createSpriteTexture', () => {
  const withPicture = (assetId: string | null): SpriteDescriptor => ({
    ...DEFAULT_SPRITE,
    map: assetId ? { assetId } : null,
  })

  it('installs the picture the descriptor asks for, read as colour', async () => {
    const scripted = scriptedTextureCache()
    const spriteMaterial = new SpriteMaterial()
    const texture = createSpriteTexture(scripted.cache, spriteMaterial, onSpriteChange)

    texture.apply(withPicture('pic-1'))
    const loaded = await scripted.settle('pic-1')

    expect(spriteMaterial.map).toBe(loaded)
    expect(scripted.spaces.get('pic-1')).toBe(SRGBColorSpace)
  })

  it('gives the previous picture back when the sprite changes its mind', async () => {
    const scripted = scriptedTextureCache()
    const spriteMaterial = new SpriteMaterial()
    const texture = createSpriteTexture(scripted.cache, spriteMaterial, onSpriteChange)

    texture.apply(withPicture('pic-1'))
    await scripted.settle('pic-1')
    texture.apply(withPicture('pic-2'))

    expect(scripted.released).toEqual(['pic-1'])
  })

  // What arrives for a sprite that has moved on must not land: the reference went back with it.
  it('drops a picture that lands after the sprite let it go', async () => {
    const scripted = scriptedTextureCache()
    const spriteMaterial = new SpriteMaterial()
    const texture = createSpriteTexture(scripted.cache, spriteMaterial, onSpriteChange)

    texture.apply(withPicture('slow'))
    texture.apply(withPicture(null))
    await scripted.settle('slow')

    expect(spriteMaterial.map).toBeNull()
  })

  it('empties the slot and gives its reference back when the sprite goes', async () => {
    const scripted = scriptedTextureCache()
    const spriteMaterial = new SpriteMaterial()
    const texture = createSpriteTexture(scripted.cache, spriteMaterial, onSpriteChange)

    texture.apply(withPicture('pic-1'))
    await scripted.settle('pic-1')
    texture.dispose()

    expect(scripted.released).toEqual(['pic-1'])
    expect(spriteMaterial.map).toBeNull()
  })
})
