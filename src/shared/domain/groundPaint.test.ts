import { describe, expect, it } from 'vitest'
import {
  emptyGroundPaint,
  emptyGroundWeights,
  paintGroundChannelDisk,
  paintGroundDisk,
} from './groundPaint'

describe('ground paint', () => {
  it('paints the RGBA texels covered by a world-space dab', () => {
    const before = emptyGroundPaint(5, 5)
    const after = paintGroundDisk(
      before,
      { origin: { x: 10, z: 20 }, size: { x: 4, z: 4 }, elevation: { min: 0, max: 1 } },
      { x: 12, z: 22, radius: 1.1, amount: 1, falloff: 0, color: [20, 180, 40, 255] },
    )

    const pixel = (x: number, z: number) => [
      ...after.pixels.slice((z * 5 + x) * 4, (z * 5 + x) * 4 + 4),
    ]
    expect(pixel(2, 2)).toEqual([20, 180, 40, 255])
    expect(pixel(1, 2)).toEqual([20, 180, 40, 255])
    expect(pixel(0, 0)).toEqual([0, 0, 0, 0])
    expect(before.pixels.every(value => value === 0)).toBe(true)
  })

  it('starts splat weights with the legacy layer fully visible', () => {
    const paint = emptyGroundWeights(2, 2)

    expect([...paint.pixels]).toEqual([255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0])
  })

  it('paints only the armed material channel', () => {
    const before = emptyGroundWeights(3, 3)
    before.pixels[4] = 64
    const after = paintGroundChannelDisk(
      before,
      { origin: { x: 0, z: 0 }, size: { x: 2, z: 2 }, elevation: { min: 0, max: 1 } },
      { x: 1, z: 0, radius: 0, amount: 1, falloff: 0 },
      'g',
    )

    expect([...after.pixels.slice(4, 8)]).toEqual([64, 255, 0, 0])
    expect([...before.pixels.slice(4, 8)]).toEqual([64, 0, 0, 0])
  })
})
