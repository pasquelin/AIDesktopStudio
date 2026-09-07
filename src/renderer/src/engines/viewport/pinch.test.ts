import { describe, expect, it } from 'vitest'
import { fingerGap } from './pinch'

describe('what two fingers say', () => {
  it('spreads by the distance between them, whichever one is named first', () => {
    expect(fingerGap({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 })).toBe(5)
    expect(fingerGap({ clientX: 3, clientY: 4 }, { clientX: 0, clientY: 0 })).toBe(5)
  })

  /** Two fingers landing on the same pixel: a gap of zero, and a dolly of nothing until they move. */
  it('reads no gap at all between two fingers in the same place', () => {
    expect(fingerGap({ clientX: 7, clientY: 7 }, { clientX: 7, clientY: 7 })).toBe(0)
  })
})
