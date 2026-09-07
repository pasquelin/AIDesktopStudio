import { describe, expect, it } from 'vitest'
import { compareVisualFrames, type VisualFrame } from './visualRegression'

const frame = (pixels: readonly number[], width = 1, height = 1): VisualFrame => ({
  width,
  height,
  pixels: new Uint8Array(pixels),
})

describe('SAFE visual regression', () => {
  it('accepts rasterizer noise within the declared channel tolerance', () => {
    expect(
      compareVisualFrames(frame([10, 20, 30, 255]), frame([11, 19, 30, 255]), {
        channelTolerance: 1,
        maximumChangedPixelRatio: 0,
      }),
    ).toMatchObject({ equivalent: true, changedPixels: 0, maximumChannelDifference: 1 })
  })

  it('fails when significant pixels exceed the declared ratio', () => {
    expect(
      compareVisualFrames(
        frame([0, 0, 0, 255, 0, 0, 0, 255], 2),
        frame([20, 0, 0, 255, 0, 0, 0, 255], 2),
        { channelTolerance: 2, maximumChangedPixelRatio: 0.4 },
      ),
    ).toMatchObject({ equivalent: false, changedPixels: 1, changedPixelRatio: 0.5 })
  })

  it('refuses different dimensions even when byte counts match', () => {
    expect(() =>
      compareVisualFrames(frame(new Array(16).fill(0), 2, 2), frame(new Array(16).fill(0), 1, 4), {
        channelTolerance: 0,
        maximumChangedPixelRatio: 0,
      }),
    ).toThrow('equal non-empty RGBA dimensions')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 256, -1, 0.5])(
    'refuses the unsafe channel tolerance %s',
    channelTolerance => {
      expect(() =>
        compareVisualFrames(frame([0, 0, 0, 255]), frame([0, 0, 0, 255]), {
          channelTolerance,
          maximumChangedPixelRatio: 0,
        }),
      ).toThrow('outside their valid range')
    },
  )

  it('refuses empty captures', () => {
    expect(() =>
      compareVisualFrames(frame([], 0, 0), frame([], 0, 0), {
        channelTolerance: 0,
        maximumChangedPixelRatio: 0,
      }),
    ).toThrow('non-empty')
  })
})
