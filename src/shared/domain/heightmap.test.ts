import { describe, expect, it } from 'vitest'
import { heightmapSamplesOf } from './heightmap'

describe('heightmapSamplesOf', () => {
  it('takes the first channel of a packed grid, leaving the rest', () => {
    const held = heightmapSamplesOf({
      data: new Float32Array([1, 0, 0, 1, 2, 0, 0, 1, 3, 0, 0, 1, 4, 0, 0, 1]),
      width: 2,
      height: 2,
    })

    expect(held).toEqual({ width: 2, height: 2, values: new Float32Array([1, 2, 3, 4]) })
  })

  it('reads a single-channel grid as it is', () => {
    expect(
      heightmapSamplesOf({ data: new Float32Array([0.5, 1.5, 2.5, 3.5]), width: 2, height: 2 })
        .values,
    ).toEqual(new Float32Array([0.5, 1.5, 2.5, 3.5]))
  })

  it('refuses a buffer that is not a grid of samples', () => {
    expect(() =>
      heightmapSamplesOf({ data: new Float32Array([1, 2, 3]), width: 2, height: 2 }),
    ).toThrow('heightmap is not a grid of samples')
  })
})
