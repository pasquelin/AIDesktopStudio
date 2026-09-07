import { describe, expect, it } from 'vitest'
import type { ProjectedSegment } from './bonePicking'
import {
  boxAround,
  boxBetween,
  boxesTouch,
  boxHolds,
  frontmostSegmentIn,
  idsTouching,
  type ScreenBody,
} from './marqueeSelection'

/** Three bodies in a row, a unit apart and a fifth of a unit across — three cubes on a floor. */
const CUBES: readonly ScreenBody[] = [
  { id: 'left', box: boxAround({ x: -1, y: 0 }, 0.2) },
  { id: 'middle', box: boxAround({ x: 0, y: 0 }, 0.2) },
  { id: 'right', box: boxAround({ x: 1, y: 0 }, 0.2) },
]

const segment = (bone: string, x: number, z: number): ProjectedSegment => ({
  nodeId: 'rig',
  bone,
  head: { x, y: 0, z },
  tail: { x, y: 0.3, z },
})

describe('the box a drag carves out', () => {
  it('is the same whichever way the hand went', () => {
    const down = boxBetween({ x: 1, y: 2 }, { x: 4, y: 8 })

    expect(boxBetween({ x: 4, y: 8 }, { x: 1, y: 2 })).toEqual(down)
    expect(down).toEqual({ minX: 1, minY: 2, maxX: 4, maxY: 8 })
  })

  it('holds a point on its own edge, a body flush against the sweep being one it crossed', () => {
    expect(boxHolds(boxBetween({ x: 0, y: 0 }, { x: 2, y: 2 }), { x: 2, y: 1 })).toBe(true)
  })
})

describe('what a marquee takes', () => {
  it('takes the three bodies it was dragged across', () => {
    expect(idsTouching(boxBetween({ x: -2, y: -1 }, { x: 2, y: 1 }), CUBES)).toEqual([
      'left',
      'middle',
      'right',
    ])
  })

  it('takes only what it reaches', () => {
    expect(idsTouching(boxBetween({ x: -0.5, y: -1 }, { x: 0.5, y: 1 }), CUBES)).toEqual(['middle'])
  })

  it('takes nothing at all where it crossed nothing, which is how a sweep clears a selection', () => {
    expect(idsTouching(boxBetween({ x: 5, y: 5 }, { x: 6, y: 6 }), CUBES)).toEqual([])
  })

  /**
   * TOUCHING takes: a rectangle that had to swallow a body whole would miss every floor, and a
   * floor is the one body always larger than the view.
   */
  it('takes a body it only clipped the edge of', () => {
    expect(idsTouching(boxBetween({ x: 0.75, y: -1 }, { x: 0.85, y: 1 }), CUBES)).toEqual(['right'])
  })

  /**
   * Device coordinates normalise each side of the view on its own, so one world radius is two
   * different numbers on a pane wider than it is tall — read as one, a rectangle swept over the
   * top third of every cube on a 16:9 pane reported no touch at all.
   */
  it('spans a body by one half-extent per axis', () => {
    const wide = boxAround({ x: 0, y: 0 }, 0.28, 0.5)

    expect(boxesTouch(boxBetween({ x: -0.1, y: 0.3 }, { x: 0.1, y: 0.6 }), wide)).toBe(true)
    expect(boxesTouch(boxBetween({ x: 0.4, y: -0.1 }, { x: 0.6, y: 0.1 }), wide)).toBe(false)
  })

  it('takes the first half-extent for both when given one, a square being the common case', () => {
    expect(boxAround({ x: 0, y: 0 }, 2)).toEqual(boxAround({ x: 0, y: 0 }, 2, 2))
  })

  it('holds two boxes apart on either axis', () => {
    const one = boxAround({ x: 0, y: 0 }, 1)

    expect(boxesTouch(one, boxAround({ x: 3, y: 0 }, 1))).toBe(false)
    expect(boxesTouch(one, boxAround({ x: 0, y: 3 }, 1))).toBe(false)
  })
})

describe('what a marquee names in pose mode', () => {
  it('names the bone nearest the camera among those it crossed', () => {
    const box = boxBetween({ x: -1, y: -1 }, { x: 1, y: 1 })
    const picked = frontmostSegmentIn([segment('far', 0, 0.8), segment('near', 0, 0.1)], box)

    expect(picked?.bone).toBe('near')
  })

  it('names nothing where it crossed no bone', () => {
    const box = boxBetween({ x: 4, y: 4 }, { x: 5, y: 5 })

    expect(frontmostSegmentIn([segment('spine', 0, 0)], box)).toBeNull()
  })

  /** A bone half out of the view is still half of it takeable — either end is enough. */
  it('names one it crossed by its tail alone', () => {
    const box = boxBetween({ x: -0.1, y: 0.2 }, { x: 0.1, y: 0.4 })

    expect(frontmostSegmentIn([segment('arm', 0, 0)], box)?.bone).toBe('arm')
  })

  /** Behind the camera, `project` flips the sign: a bone at one's back would land in the box. */
  it('leaves out a bone that is off screen at both ends', () => {
    const box = boxBetween({ x: -1, y: -1 }, { x: 1, y: 1 })

    expect(frontmostSegmentIn([segment('behind', 0, -4)], box)).toBeNull()
  })
})
