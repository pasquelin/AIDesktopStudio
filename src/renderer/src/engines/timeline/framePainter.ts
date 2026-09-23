import { Texture, type Sprite, type TextureSource } from 'pixi.js'
import type { Size } from '../core/geometry'
import type { DecoderPool } from './decoderPool'
import { fitSprite, swapTexture } from './timelinePresentation'
import { clipSource, type Clip } from './timelineState'

/** What a renderer must offer to take a frame now rather than at its next pass. */
export type TextureUploader = { initSource: (source: TextureSource) => void }

/**
 * Puts a texture on the GPU now, and hands it back. Pixi uploads a source at its next render —
 * by which time the sink has closed the frame behind it, and the monitor paints nothing at all.
 */
export function uploadNow(texture: Texture, uploader: TextureUploader): Texture {
  uploader.initSource(texture.source)
  return texture
}

export type FrameSink = { push: (frame: VideoFrame) => void }

/** Uploads then closes, always in that order and always both. */
export function createFrameSink({ upload }: { upload: (frame: VideoFrame) => void }): FrameSink {
  return {
    push: frame => {
      try {
        upload(frame)
      } finally {
        frame.close()
      }
    },
  }
}

/** One track's answer for a frame: its sprite, what it draws, and the decode it is waiting on. */
export type TrackAsk = {
  sprite: Sprite
  clip: Clip | null
  source: string | null
  trackId: string
  reuse: boolean
  frame: Promise<VideoFrame | null> | null
}

/**
 * What every track's answer does to its sprite, and what the frame as a whole came to: whether
 * anything reached the screen, and whether a clip that is there showed nothing.
 */
export function paintDecoded(
  asked: readonly TrackAsk[],
  decoded: readonly (VideoFrame | null)[],
  pool: DecoderPool,
  painted: Map<string, string>,
  uploader: TextureUploader,
  canvas: Size,
): { drew: boolean; unreadable: boolean } {
  let drew = false
  let unreadable = false

  asked.forEach(({ sprite, clip, source, trackId, reuse }, index) => {
    if (reuse) {
      sprite.visible = true
      drew = true
      return
    }

    const frame = decoded[index]
    if (!frame) {
      sprite.visible = false
      painted.delete(trackId)
      if (clip && pool.undecodable(clipSource(clip))) unreadable = true
      return
    }

    sprite.visible = true
    drew = true
    if (source) painted.set(trackId, source)
    createFrameSink({
      upload: uploaded => swapTexture(sprite, uploadNow(Texture.from(uploaded), uploader)),
    }).push(frame)
    fitSprite(sprite, canvas)
  })

  return { drew, unreadable }
}
