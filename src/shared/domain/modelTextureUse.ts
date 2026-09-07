import type { PbrChannel, MaterialSettings } from './material'
import type { TextureSampling } from './textureSampling'

export type ModelTextureUse = {
  materialIndex: number
  materialName: string
  slot: string
  channel?: PbrChannel
  sampling: TextureSampling
  settings: Pick<
    MaterialSettings,
    | 'color'
    | 'roughness'
    | 'metalness'
    | 'normalScale'
    | 'aoIntensity'
    | 'emissive'
    | 'emissiveIntensity'
    | 'tiling'
    | 'offset'
    | 'rotation'
  >
}
