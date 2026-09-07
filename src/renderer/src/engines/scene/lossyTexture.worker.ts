/// <reference lib="webworker" />
import {
  writableFormat,
  type LossyTextureRequest,
  type LossyTextureResponse,
} from './lossyTextureMessage'

declare const self: DedicatedWorkerGlobalScope

self.addEventListener('message', (event: MessageEvent<LossyTextureRequest>) => {
  void optimize(event.data)
})

async function optimize(request: LossyTextureRequest): Promise<void> {
  try {
    self.postMessage({ id: request.id, done: false, progress: 0.1 } satisfies LossyTextureResponse)
    const bitmap = await createImageBitmap(new Blob([request.bytes]))
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * request.scale)),
      Math.max(1, Math.round(bitmap.height * request.scale)),
    )
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      self.postMessage({ id: request.id, done: true, ok: true } satisfies LossyTextureResponse)
      return
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const format = writableFormat(
      request.format,
      context.getImageData(0, 0, canvas.width, canvas.height).data,
    )
    const quality = format === 'jpg' ? request.quality : undefined
    const blob = await canvas.convertToBlob({
      type: format === 'png' ? 'image/png' : 'image/jpeg',
      ...(quality === undefined ? {} : { quality }),
    })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    self.postMessage(
      {
        id: request.id,
        done: true,
        ok: true,
        override: { id: request.assetId, bytes, extension: format },
      } satisfies LossyTextureResponse,
      [bytes.buffer],
    )
  } catch {
    // Containers unsupported by Chromium remain byte-identical instead of aborting the package.
    self.postMessage({ id: request.id, done: true, ok: true } satisfies LossyTextureResponse)
  }
}
