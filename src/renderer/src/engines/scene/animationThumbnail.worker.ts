/// <reference lib="webworker" />
import { messageOf } from '@shared/guards'
import { createAnimationThumbnailRenderer } from './animationThumbnailRenderer'
import type {
  AnimationThumbnailRequest,
  AnimationThumbnailResponse,
} from './animationThumbnailMessage'

declare const self: DedicatedWorkerGlobalScope
let renderer: Awaited<ReturnType<typeof createAnimationThumbnailRenderer>> | undefined
self.addEventListener('message', (event: MessageEvent<AnimationThumbnailRequest>) => {
  void render(event.data)
})
async function render(request: AnimationThumbnailRequest): Promise<void> {
  try {
    if (!renderer) {
      if (!request.model) throw new Error('The thumbnail character is missing')
      renderer = await createAnimationThumbnailRenderer(request.model, request.decoderRoot)
    }
    const { png } = await renderer.render(request)
    self.postMessage({ id: request.id, ok: true, png } satisfies AnimationThumbnailResponse, [
      png.buffer,
    ])
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: messageOf(error),
    } satisfies AnimationThumbnailResponse)
  }
}
