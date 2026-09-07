import type { TextureSampling } from './textureSampling'

type TextureTransform = {
  tiling: { x: number; y: number }
  offset: { x: number; y: number }
  rotation: number
}

export type TextureRef = {
  assetId: string
  transform?: TextureTransform
  sampling?: TextureSampling
}
