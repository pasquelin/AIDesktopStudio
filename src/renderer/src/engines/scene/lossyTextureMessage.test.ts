import { describe, expect, it } from 'vitest'
import { writableFormat } from './lossyTextureMessage'

function pixels(alphas: readonly number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(alphas.flatMap(alpha => [40, 80, 120, alpha]))
}

describe('the format a reduced texture is written in', () => {
  it('compresses an opaque image to JPEG when compression was asked for', () => {
    expect(writableFormat('jpg', pixels([255, 255, 255]))).toBe('jpg')
  })

  it('keeps a foliage cut-out lossless rather than flattening its alpha', () => {
    expect(writableFormat('jpg', pixels([255, 0, 255]))).toBe('png')
    expect(writableFormat('jpg', pixels([255, 254, 255]))).toBe('png')
  })

  it('never compresses an image the caller asked to keep lossless', () => {
    expect(writableFormat('png', pixels([255, 255]))).toBe('png')
  })
})
