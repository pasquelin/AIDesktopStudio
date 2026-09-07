import { describe, expect, it, vi } from 'vitest'
import { Vector3 } from 'three'
import { gazeTargetOf, onScreen, PIVOT_AHEAD, pivotFor, type PivotMode } from './orbitPivot'

const BOTH: PivotMode = { aroundSelection: true, underCursor: true }
const NEITHER: PivotMode = { aroundSelection: false, underCursor: false }

const SELECTION = new Vector3(1, 1, 1)
const UNDER_CURSOR = new Vector3(2, 2, 2)
const SETTLED = new Vector3(3, 3, 3)

function sources(over: { selection?: Vector3 | null; underCursor?: Vector3 | null } = {}) {
  const { selection = SELECTION, underCursor = UNDER_CURSOR } = over
  return { selection: () => selection, underCursor: () => underCursor, settled: SETTLED }
}

describe('deciding where the view turns', () => {
  it('asks for nothing a preference does not want, a ray over the scene being the dear one', () => {
    const cast = vi.fn(() => UNDER_CURSOR)

    pivotFor({ selection: () => null, underCursor: cast, settled: SETTLED }, NEITHER)

    expect(cast).not.toHaveBeenCalled()
  })

  it('turns around the selection when asked to, which is what the gizmo sits on', () => {
    expect(pivotFor(sources(), BOTH)).toEqual(SELECTION)
  })

  it('falls through to the cursor when nothing is selected', () => {
    expect(pivotFor(sources({ selection: null }), BOTH)).toEqual(UNDER_CURSOR)
  })

  it('ignores the selection when the preference is off, however much is selected', () => {
    expect(pivotFor(sources(), { aroundSelection: false, underCursor: true })).toEqual(UNDER_CURSOR)
  })

  it('falls through to the cursor when the ray met nothing at all', () => {
    expect(pivotFor(sources({ selection: null, underCursor: null }), BOTH)).toEqual(SETTLED)
  })

  it('keeps where the view settled when both preferences are off', () => {
    expect(pivotFor(sources(), NEITHER)).toEqual(SETTLED)
  })
})

describe('whether a point is worth turning around', () => {
  it('takes a point inside the view', () => {
    expect(onScreen({ x: 0.4, y: -0.9, z: 0.2 })).toBe(true)
  })

  it('refuses one off the side, which is what yanks the view in Unreal', () => {
    expect(onScreen({ x: 1.4, y: 0, z: 0.2 })).toBe(false)
  })

  it('refuses one behind the camera, which projects into the box with its depth inverted', () => {
    expect(onScreen({ x: 0, y: 0, z: 1.6 })).toBe(false)
  })
})

/**
 * `viewPlacement`, the trihedron and a pane going orthographic all take the pivot for what the
 * camera looks at, and restore it by `lookAt`. Off the axis, every one of them turns the view.
 */
describe('bringing a pivot back onto the line of sight', () => {
  const FROM = new Vector3(0, 0, 10)
  const GAZE = new Vector3(0, 0, -1)

  it('keeps the depth it had, and drops what was off to the side', () => {
    expect(gazeTargetOf(FROM, GAZE, new Vector3(6, -3, 4)).toArray()).toEqual([0, 0, 4])
  })

  it('rests ahead of the camera for a pivot that ended up behind it', () => {
    expect(gazeTargetOf(FROM, GAZE, new Vector3(0, 0, 40)).z).toBeCloseTo(10 - PIVOT_AHEAD, 6)
  })
})
