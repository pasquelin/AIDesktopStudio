import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { panBy } from './pan'

const HEIGHT = 900
const FIELD_OF_VIEW = 50

/** Looking down −Z from ten metres out, level, which is where every case below starts. */
function facingOrigin() {
  return {
    position: new Vector3(0, 0, 10),
    quaternion: new Quaternion(),
    pivot: new Vector3(),
    height: HEIGHT,
    fieldOfView: FIELD_OF_VIEW,
  }
}

describe('panning the view', () => {
  it('sends the camera left when the hand drags right, the world following the hand', () => {
    const move = panBy({ ...facingOrigin(), deltaX: 100, deltaY: 0 })
    expect(move.position.x).toBeLessThan(0)
  })

  it('sends the camera up when the hand drags down', () => {
    const move = panBy({ ...facingOrigin(), deltaX: 0, deltaY: 100 })
    expect(move.position.y).toBeGreaterThan(0)
  })

  it('carries the pivot along, so the next orbit turns around the same thing', () => {
    const start = facingOrigin()
    const move = panBy({ ...start, deltaX: 140, deltaY: -60 })

    expect(move.pivot.distanceTo(start.pivot)).toBeCloseTo(move.position.distanceTo(start.position))
    expect(move.position.distanceTo(move.pivot)).toBeCloseTo(10, 6)
  })

  it('covers exactly what the frustum shows at the pivot, for a drag of one height', () => {
    const move = panBy({ ...facingOrigin(), deltaX: 0, deltaY: HEIGHT })
    // What a perspective camera frames at that distance — the same arithmetic `OrbitControls`
    // pans by, and what makes a grabbed point stay under the pointer.
    expect(move.position.y).toBeCloseTo(2 * 10 * Math.tan((FIELD_OF_VIEW * Math.PI) / 360), 6)
  })

  it('travels further the further the pivot is, which is what keeps the speed readable', () => {
    const near = panBy({ ...facingOrigin(), pivot: new Vector3(0, 0, 5), deltaX: 100, deltaY: 0 })
    const far = panBy({ ...facingOrigin(), pivot: new Vector3(0, 0, -90), deltaX: 100, deltaY: 0 })
    expect(Math.abs(far.position.x)).toBeGreaterThan(Math.abs(near.position.x))
  })

  it('stands still for a pane of no height, rather than travelling by infinity', () => {
    const start = facingOrigin()
    const move = panBy({ ...start, height: 0, deltaX: 100, deltaY: 100 })
    expect(move.position.distanceTo(start.position)).toBeCloseTo(0, 6)
  })
})
