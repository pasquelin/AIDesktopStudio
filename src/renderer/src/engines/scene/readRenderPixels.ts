import type { WebGLRenderer, WebGLRenderTarget } from 'three'

/** Reads one disposable RGBA buffer, ready to be transferred without another UI-thread copy. */
export function readRenderPixels(
  renderer: WebGLRenderer,
  target: WebGLRenderTarget,
  width: number,
  height: number,
): Uint8Array {
  const pixels = new Uint8Array(width * height * 4)
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels)
  return pixels
}
