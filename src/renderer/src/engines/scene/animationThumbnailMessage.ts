import type { AnimationPoster } from '@shared/domain/animationLibrary'

export type AnimationThumbnailRequest = {
  id: number
  model?: ArrayBuffer
  decoderRoot?: string
  animationUrl: string
  /** For the failures alone: nothing is DECIDED by it any more — see `AnimationPoster`. */
  name: string
  poster?: AnimationPoster
}
export type AnimationThumbnailResponse =
  { id: number; ok: true; png: Uint8Array } | { id: number; ok: false; error: string }
