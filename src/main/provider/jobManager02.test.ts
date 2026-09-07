import { describe, expect, it } from 'vitest'

import { jobProgressOf } from './jobManager'

describe('progress normalisation', () => {
  it('leaves the fraction the SDK types promise alone', () => {
    expect(jobProgressOf(0)).toBe(0)
    expect(jobProgressOf(0.42)).toBe(0.42)
    expect(jobProgressOf(1)).toBe(1)
  })

  // Passed on as-is, the 0 to 100 the guide describes would show as 10000 % in the jobs bar.
  it('reads a reading past the fraction scale as a percentage', () => {
    expect(jobProgressOf(100)).toBe(1)
    expect(jobProgressOf(40)).toBe(0.4)
  })

  // The scale a generation ends on: `ProgressBar` clamps 1.02 rather than divide it by a hundred.
  it('reads a generation overshooting its own scale as finished, not as one percent', () => {
    expect(jobProgressOf(1.02)).toBe(1)
    expect(jobProgressOf(2)).toBe(1)
  })

  it('never reports outside the fraction it promises', () => {
    expect(jobProgressOf(150)).toBe(1)
    expect(jobProgressOf(-1)).toBe(0)
    expect(jobProgressOf(Number.NaN)).toBe(0)
  })
})
