import { WebGLRenderTarget, type WebGLRenderer } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { readRenderPixels } from './readRenderPixels'

describe('readRenderPixels', () => {
  it('returns the exact disposable buffer filled by the renderer', () => {
    let filled: Uint8Array | undefined
    const renderer = {
      readRenderTargetPixels: vi.fn(
        (
          _target: WebGLRenderTarget,
          _x: number,
          _y: number,
          _width: number,
          _height: number,
          pixels: Uint8Array,
        ) => {
          filled = pixels
          pixels.set([1, 2, 3, 4])
        },
      ),
    } as unknown as WebGLRenderer

    const pixels = readRenderPixels(renderer, new WebGLRenderTarget(1, 1), 1, 1)

    expect(pixels).toBe(filled)
    expect(pixels).toEqual(new Uint8Array([1, 2, 3, 4]))
  })
})
