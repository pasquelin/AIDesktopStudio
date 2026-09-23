import { describe, expect, it } from 'vitest'
import { budgetFor, chainSize, samplesOf } from './postQuality'

/**
 * The one place the speed/definition trade is decided. An effect choosing its own resolution
 * would make the setting unpredictable, which § 18 forbids more firmly than it asks for speed.
 */
describe('what a composition is allowed to spend', () => {
  it('spends everything at the top setting, whatever it holds', () => {
    expect(budgetFor('high', 'high')).toEqual({ divisor: 1, samples: 1 })
  })

  it('never downscales a stack of cheap effects — there would be nothing to save', () => {
    expect(budgetFor('low', 'performance')).toEqual({ divisor: 1, samples: 0.6 })
    expect(budgetFor(null, 'performance')).toEqual({ divisor: 1, samples: 1 })
  })

  it('takes samples before pixels: definition goes last', () => {
    expect(budgetFor('high', 'balanced')).toEqual({ divisor: 1, samples: 0.6 })
    expect(budgetFor('high', 'performance')).toEqual({ divisor: 2, samples: 0.4 })
  })
})

describe('the arithmetic a budget drives', () => {
  it('halves the chain where the budget says so, and never below one step', () => {
    expect(chainSize(1920, 1088, { divisor: 2, samples: 1 })).toEqual({ width: 960, height: 544 })
    expect(chainSize(1, 1, { divisor: 2, samples: 1 })).toEqual({ width: 8, height: 8 })
  })

  /**
   * Copied on the way out, and it is not a nicety: `chainSize` answers a SCRATCH object, so
   * comparing two calls compares one object with itself and passes whatever the arithmetic does.
   */
  const sizeOf = (width: number, height: number) => ({
    ...chainSize(width, height, { divisor: 1, samples: 1 }),
  })

  /**
   * The step is what stops a chain being freed and rebuilt several times an IMAGE: chains are
   * cached on the SHAPE of a stack and never on its size, and `paneRects` gives a quad's four
   * panes different widths the moment the canvas is odd.
   */
  it('gives neighbouring sizes the same chain, rounding up so none is ever coarser', () => {
    expect(sizeOf(683, 384)).toEqual(sizeOf(684, 384))
    // Up, never down: a chain finer than its surface invents nothing, a coarser one blurs.
    expect(sizeOf(683, 384).width).toBeGreaterThanOrEqual(683)
  })

  it('follows a resize that crosses a step', () => {
    expect(sizeOf(700, 384)).not.toEqual(sizeOf(720, 384))
  })

  it('cuts a sample count, and never below one sample', () => {
    expect(samplesOf(16, { samples: 0.4 })).toBe(6)
    expect(samplesOf(1, { samples: 0.4 })).toBe(1)
  })
})
