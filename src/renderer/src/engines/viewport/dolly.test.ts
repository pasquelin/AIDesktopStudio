import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { DOLLY_FLOOR, DOLLY_RATE, dollyTo, dragNotchesOf, notchesOf } from './dolly'

const FORWARD = new Vector3(0, 0, -1)

/** Straight ahead: the aim and the gaze agree, which is the wheel over the middle of the view. */
function ahead(from: Vector3, aimed: Vector3, notches: number) {
  return dollyTo({ position: from, aim: FORWARD, aimed, notches })
}

describe('dollying towards what the pointer aims at', () => {
  it('moves further when what is aimed at is further away', () => {
    const near = ahead(new Vector3(), new Vector3(0, 0, -10), 1)
    const far = ahead(new Vector3(), new Vector3(0, 0, -100), 1)
    expect(far.position.z).toBeLessThan(near.position.z)
  })

  it('keeps a floor in metres, so approaching never dies out one shrinking step at a time', () => {
    let position = new Vector3()
    // A target a millimetre ahead: proportional alone would step by a micrometre and stall.
    for (let i = 0; i < 20; i++) {
      position = ahead(position, new Vector3(0, 0, position.z - 0.001), 1).position
    }
    expect(position.z).toBeLessThanOrEqual(-20 * DOLLY_FLOOR)
  })

  it('crosses what it aims at instead of stopping short of it', () => {
    const target = new Vector3(0, 0, -0.02)
    const moved = ahead(new Vector3(), target, 1)
    expect(moved.position.z).toBeLessThan(target.z)
  })

  /**
   * The band all close-up work lives in. A floor applied to a surface merely NEARER than the
   * resting distance puts the pivot behind it, and the next drag orbits a point past the model.
   */
  it('keeps the pivot ON a surface that is nearer than the resting distance', () => {
    const moved = ahead(new Vector3(), new Vector3(0, 0, -2), 1)
    expect(moved.pivot?.z).toBeCloseTo(-2, 6)
    expect(moved.crossed).toBe(false)
  })

  it('leaves the pivot to the caller once it has crossed, rather than resting it anywhere', () => {
    expect(ahead(new Vector3(), new Vector3(0, 0, -0.02), 1).pivot).toBeNull()
  })

  /**
   * What the caller re-aims on. The step is scaled by the distance to what was aimed at, so a
   * crossed point left in place makes every further notch of one flick ~12% larger than the last.
   */
  it('says when it has crossed, so the caller can aim again', () => {
    expect(ahead(new Vector3(), new Vector3(0, 0, -0.02), 1).crossed).toBe(true)
    expect(ahead(new Vector3(), new Vector3(0, 0, -100), 1).crossed).toBe(false)
  })

  it('puts the pivot at the depth of what was aimed at while that is still ahead', () => {
    const moved = ahead(new Vector3(), new Vector3(0, 0, -100), 1)
    expect(moved.pivot?.z).toBeCloseTo(-100, 6)
  })

  /**
   * The reason `PIVOT_AHEAD` is gone, and the reason `update()` no longer runs on a perspective
   * pane: the pivot is the world point the pointer MET, off centre and all, so the next orbit
   * turns around what was zoomed onto rather than around its depth brought back to the middle.
   */
  it('puts the pivot on what the pointer met, off the line of sight and all', () => {
    const moved = dollyTo({
      position: new Vector3(),
      aim: new Vector3(1, 0, -1).normalize(),
      aimed: new Vector3(30, 0, -30),
      notches: 1,
    })

    expect(moved.pivot?.x).toBeCloseTo(30, 6)
    expect(moved.pivot?.z).toBeCloseTo(-30, 6)
  })

  it('travels towards the pointer rather than towards the middle of the view', () => {
    const aim = new Vector3(1, 0, -1).normalize()
    const moved = dollyTo({
      position: new Vector3(),
      aim,
      aimed: new Vector3(0, 0, -10),
      notches: 1,
    })
    expect(moved.position.x).toBeGreaterThan(0)
  })

  it('backs away along the same line the wheel came in on', () => {
    const moved = ahead(new Vector3(), new Vector3(0, 0, -10), -1)
    expect(moved.position.z).toBeGreaterThan(0)
  })

  it('backs away faster the further out it already is, so a wide scene is left quickly', () => {
    const near = ahead(new Vector3(), new Vector3(0, 0, -10), -1).position.z
    const far = ahead(new Vector3(), new Vector3(0, 0, -1000), -1).position.z
    expect(far).toBeGreaterThan(near)
  })

  it('spends a trackpad flick in one go rather than a cran at a time', () => {
    const once = ahead(new Vector3(), new Vector3(0, 0, -10), 1).position.z
    const thrice = ahead(new Vector3(), new Vector3(0, 0, -10), 3).position.z
    expect(thrice).toBeCloseTo(once * 3, 6)
  })

  it('takes the rate from the distance, which is what makes one wheel serve every scale', () => {
    const moved = ahead(new Vector3(), new Vector3(0, 0, -10), 1)
    expect(moved.position.z).toBeCloseTo(-10 * DOLLY_RATE, 6)
  })
})

describe('reading the wheel', () => {
  it('takes a detent forward as one notch towards what is aimed at', () => {
    expect(notchesOf(-100)).toBe(1)
  })

  it('reads a detent backwards as pulling away', () => {
    expect(notchesOf(100)).toBe(-1)
  })

  it('answers a trackpad in fractions rather than rounding its many small deltas to nothing', () => {
    expect(notchesOf(-8)).toBeCloseTo(0.08, 6)
  })

  it('normalises line and page wheel events before measuring their travel', () => {
    expect(notchesOf(-1, 1)).toBeCloseTo(0.16, 6)
    expect(notchesOf(-1, 2)).toBe(5)
  })

  it('caps one violent flick, which would otherwise cross the whole scene at once', () => {
    expect(notchesOf(-100000)).toBe(notchesOf(-1000))
  })
})

describe('the notches a chord drag spends', () => {
  it('closes in when the hand goes right, as Unity does', () => {
    expect(dragNotchesOf(60, 0)).toBeGreaterThan(0)
  })

  it('closes in when the hand goes up, as Blender does', () => {
    expect(dragNotchesOf(0, -60)).toBeGreaterThan(0)
  })

  it('pulls away the other way', () => {
    expect(dragNotchesOf(-60, 0)).toBeLessThan(0)
  })

  /** A diagonal spends both, so neither axis of the gesture is dead. */
  it('adds the two axes rather than picking one', () => {
    expect(dragNotchesOf(30, -30)).toBeCloseTo(dragNotchesOf(60, 0), 6)
  })

  it('caps a flick, exactly as the wheel does', () => {
    expect(dragNotchesOf(100000, 0)).toBe(dragNotchesOf(1000, 0))
  })
})
