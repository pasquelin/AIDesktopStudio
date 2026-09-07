import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { POLE_LIMIT } from '@shared/domain/angles'
import { orbitAround } from './orbit'

const HEIGHT = 900

/** Looking down −Z from ten metres out, which is where every case below starts. */
function facingOrigin() {
  return { position: new Vector3(0, 0, 10), quaternion: new Quaternion(), pivot: new Vector3() }
}

/** Where the pivot sits in the camera's own frame — what a pixel on screen is a function of. */
function pivotInView(position: Vector3, quaternion: Quaternion, pivot: Vector3): Vector3 {
  return pivot.clone().sub(position).applyQuaternion(quaternion.clone().invert()).normalize()
}

function gazeOf(quaternion: Quaternion): Vector3 {
  return new Vector3(0, 0, -1).applyQuaternion(quaternion)
}

describe('orbiting around a pivot', () => {
  it('keeps the pivot on the same pixel, which is the whole point of not re-aiming', () => {
    const start = facingOrigin()
    // Off centre on purpose: a pivot under the pointer is never in the middle of the view, and
    // `OrbitControls` would swing it there on its next frame.
    start.pivot.set(3, -2, 1)
    const before = pivotInView(start.position, start.quaternion, start.pivot)

    const move = orbitAround({ ...start, deltaX: 120, deltaY: 45, height: HEIGHT })

    const after = pivotInView(move.position, move.quaternion, start.pivot)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
    expect(after.z).toBeCloseTo(before.z, 6)
  })

  it('keeps its distance to the pivot', () => {
    const start = facingOrigin()
    const move = orbitAround({ ...start, deltaX: 200, deltaY: 80, height: HEIGHT })
    expect(move.position.distanceTo(start.pivot)).toBeCloseTo(10, 6)
  })

  it('turns a full circle over one viewport height dragged', () => {
    const start = facingOrigin()
    const move = orbitAround({ ...start, deltaX: HEIGHT, deltaY: 0, height: HEIGHT })
    expect(move.position.x).toBeCloseTo(0, 6)
    expect(move.position.z).toBeCloseTo(10, 6)
  })

  it('raises the camera when the hand drags down, as every orbit does', () => {
    const move = orbitAround({ ...facingOrigin(), deltaX: 0, deltaY: 100, height: HEIGHT })
    expect(move.position.y).toBeGreaterThan(0)
  })

  it('sends the camera left when the hand drags right, the image following the hand', () => {
    const move = orbitAround({ ...facingOrigin(), deltaX: 100, deltaY: 0, height: HEIGHT })
    expect(move.position.x).toBeLessThan(0)
  })

  it('never tips past the pole, whatever one drag asks for', () => {
    const down = orbitAround({ ...facingOrigin(), deltaX: 0, deltaY: 10_000, height: HEIGHT })
    const up = orbitAround({ ...facingOrigin(), deltaX: 0, deltaY: -10_000, height: HEIGHT })
    expect(gazeOf(down.quaternion).y).toBeCloseTo(-Math.sin(POLE_LIMIT), 6)
    expect(gazeOf(up.quaternion).y).toBeCloseTo(Math.sin(POLE_LIMIT), 6)
  })

  it('never rolls: the horizon stays level however long the drag', () => {
    const move = orbitAround({ ...facingOrigin(), deltaX: 337, deltaY: 211, height: HEIGHT })
    expect(new Vector3(1, 0, 0).applyQuaternion(move.quaternion).y).toBeCloseTo(0, 6)
  })

  it('turns the gaze in place when the pivot is where the camera stands', () => {
    const start = facingOrigin()
    start.pivot.copy(start.position)

    const move = orbitAround({ ...start, deltaX: 100, deltaY: 0, height: HEIGHT })

    expect(move.position.distanceTo(start.position)).toBeCloseTo(0, 6)
    expect(gazeOf(move.quaternion).x).not.toBeCloseTo(0, 3)
  })

  it('stands still for a pane of no height, rather than turning by infinity', () => {
    const start = facingOrigin()
    const move = orbitAround({ ...start, deltaX: 100, deltaY: 100, height: 0 })
    expect(move.position.distanceTo(start.position)).toBeCloseTo(0, 6)
  })
})
