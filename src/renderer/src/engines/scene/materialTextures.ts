import { SRGBColorSpace, type Mesh, type MeshStandardMaterial, type SpriteMaterial } from 'three'
import type { MaterialDescriptor, SpriteDescriptor, TextureSlot } from '@shared/domain/scene'
import { createSlotBindings, createTextureBinding } from './textureBinding'
import type { TextureCache } from './textureCache'
import { giveSecondUvSet } from './threeSync'

export type MaterialTextures = {
  apply: (descriptor: MaterialDescriptor) => void
  /** Gives every reference back. The mesh is gone, or the engine with it. */
  dispose: () => void
}

/** The texture slots of one mesh, kept in line with its descriptor. */
export function createMaterialTextures(
  cache: TextureCache,
  mesh: Mesh,
  material: MeshStandardMaterial,
  onChange: (slot: TextureSlot) => void,
): MaterialTextures {
  const slots = createSlotBindings(cache, 'flipY', (slot, texture) => {
    if (material[slot] === texture) return
    // Ambient occlusion reads the second UV set, which no primitive of the studio carries:
    // left alone, ticking an AO map would do nothing at all.
    if (texture && slot === 'aoMap') giveSecondUvSet(mesh.geometry)

    material[slot] = texture
    // A slot that goes from empty to filled changes the shader program itself.
    material.needsUpdate = true
    onChange(slot)
  })

  return {
    apply: descriptor => slots.apply(descriptor),
    // Emptied rather than only given back: a material left pointing at a freed texture is one
    // the next frame would still try to draw with.
    dispose: slots.clear,
  }
}

export type SpriteTexture = {
  apply: (descriptor: SpriteDescriptor) => void
  dispose: () => void
}

/** The one map a sprite wears. Read as colour, like a mesh's base map and for the same reason. */
export function createSpriteTexture(
  cache: TextureCache,
  material: SpriteMaterial,
  onChange: () => void,
): SpriteTexture {
  const slot = createTextureBinding(cache, SRGBColorSpace, texture => {
    if (material.map === texture) return
    material.map = texture
    material.needsUpdate = true
    onChange()
  })

  return {
    apply: descriptor => slot(descriptor.map?.assetId ?? null),
    dispose: () => slot(null),
  }
}
