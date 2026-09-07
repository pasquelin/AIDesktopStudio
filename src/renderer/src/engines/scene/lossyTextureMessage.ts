import type { ExportedAssetOverride } from '@shared/domain/gameExport'

/** What the reduced image is written as. Named rather than read off the absence of a quality. */
export type TextureEncoding = {
  format: 'png' | 'jpg'
  quality?: number
}

export type LossyTextureRequest = {
  id: number
  assetId: string
  /** Transferred, so never shared: the worker blobs it without copying it first. */
  bytes: Uint8Array<ArrayBuffer>
  scale: number
} & TextureEncoding

export type LossyTextureResponse =
  | { id: number; done: false; progress: number }
  | { id: number; done: true; ok: true; override?: ExportedAssetOverride }
  | { id: number; done: true; ok: false; error: string }

/**
 * 🛑 JPEG has no alpha channel: a texture that uses transparency stays PNG whatever the
 * compression setting asked for, or a foliage cut-out exports as an opaque quad.
 */
export function writableFormat(requested: 'png' | 'jpg', pixels: Uint8ClampedArray): 'png' | 'jpg' {
  if (requested === 'png') return 'png'
  for (let index = 3; index < pixels.length; index += 4) {
    if ((pixels[index] ?? 255) < 255) return 'png'
  }
  return 'jpg'
}
