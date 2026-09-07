import { describe, expect, it } from 'vitest'
import { Euler, Quaternion } from 'three'
import { poseFractionOf, yawOf } from './animationPose'

const turnedBy = (radians: number): Quaternion =>
  new Quaternion().setFromEuler(new Euler(0, radians, 0))

describe('how far something has turned', () => {
  it('reads nothing when it stands where it rested', () => {
    expect(yawOf(turnedBy(0.7), turnedBy(0.7))).toBeCloseTo(0)
  })

  // Relative to the REST, not to the world: a clip authored facing away from the camera turns
  // exactly as much as one authored facing it.
  it('reads the turn since the rest, whichever way the rest faced', () => {
    expect(yawOf(turnedBy(1.2), turnedBy(0.7))).toBeCloseTo(0.5)
    expect(yawOf(turnedBy(-2.5), turnedBy(-3.0))).toBeCloseTo(0.5)
  })
})

/**
 * 🛑 The wrap is what tells a full turn from none. Without it a character a hair past π reads as
 * having turned almost a whole circle the other way, and a `TurnAround` is drawn facing forward.
 */
describe('which frame of a clip gets drawn', () => {
  const scoreless = (): number => 0

  it('takes the settled fraction of a clip the studio knows, without sampling', () => {
    let asked = 0
    expect(
      poseFractionOf(0.39, 17, () => {
        asked += 1
        return 1
      }),
    ).toBe(0.39)
    expect(asked).toBe(0)
  })

  it('takes the best-scoring sample of a clip it does not know', () => {
    expect(poseFractionOf(undefined, 4, fraction => (fraction === 0.5 ? 10 : 1))).toBe(0.5)
  })

  /**
   * Frame zero is never a candidate: every score measures distance FROM it, so it scores nothing
   * by construction and a clip that barely moves would be drawn at rest, every time.
   */
  it('never lands on the frame the clip starts from', () => {
    const asked: number[] = []
    poseFractionOf(undefined, 5, fraction => {
      asked.push(fraction)
      return 1
    })

    expect(asked).not.toContain(0)
    expect(asked).toEqual([0.2, 0.4, 0.6, 0.8])
  })

  it('keeps the earliest of samples that score alike', () => {
    expect(poseFractionOf(undefined, 5, scoreless)).toBe(0.2)
  })

  // A clip with nothing to sample has no frame to answer with, and a fraction outside the clip
  // would be clamped into one silently by the mixer — a picture of something nobody chose.
  it('refuses rather than answering a fraction that is not one', () => {
    expect(() => poseFractionOf(undefined, 1, scoreless)).toThrow('between 0 and 1')
    expect(() => poseFractionOf(1.5, 17, scoreless)).toThrow('between 0 and 1')
    expect(() => poseFractionOf(Number.NaN, 17, scoreless)).toThrow('between 0 and 1')
  })
})
