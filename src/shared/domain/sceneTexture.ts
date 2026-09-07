/** The maps a `MeshStandardMaterial` reads, in the order the inspector lists them. */
export type TextureSlot =
  | 'map'
  | 'normalMap'
  | 'roughnessMap'
  | 'metalnessMap'
  | 'aoMap'
  | 'emissiveMap'
  | 'displacementMap'

export const TEXTURE_SLOTS: readonly TextureSlot[] = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'displacementMap',
]

export const SHADOW_TEXTURE_SLOTS: readonly TextureSlot[] = ['displacementMap']
