import type { PbrChannel } from '@shared/domain/material'
import type { TextureSource } from '../../scene/textureCache'
import { createDerivePass } from './deriveShaders'
import { pngDrawn, runOffscreenPass, type PictureSize } from './offscreen'

export type DeriveRequest = {
  /** The channel to compute. Its source channel is what `sourceUrl` points at. */
  channel: PbrChannel
  sourceUrl: string
}

export type DerivedPicture = PictureSize & {
  /** PNG, because a channel is data before it is a picture and JPEG would invent gradients. */
  png: Uint8Array
}

/**
 * Computing one channel from another. A port because jsdom has no WebGL and no PNG encoder:
 * everything above this line is testable, and only the implementation below needs a GPU.
 */
export type DerivePort = (request: DeriveRequest) => Promise<DerivedPicture>

export type DerivePortOptions = {
  /** Injected for the same reason the renderer's is: jsdom decodes no image. */
  loadTexture: TextureSource
}

/**
 * The GPU behind the port. One context per run, released before the promise settles, and never
 * two at once — `runOffscreenPass` holds both of those.
 */
export function createDerivePort({ loadTexture }: DerivePortOptions): DerivePort {
  return ({ channel, sourceUrl }) =>
    runOffscreenPass({
      load: loadTexture,
      urls: [sourceUrl],
      pass: ([source]) => createDerivePass(channel, source.texture, source.size),
      draw: pngDrawn,
    })
}
