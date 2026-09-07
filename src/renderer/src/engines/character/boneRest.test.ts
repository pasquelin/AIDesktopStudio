import { describe, expect, it } from 'vitest'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { restWithin } from './boneRest'
import type { BoneAxis } from './boneRest'

/** A bone resting three units along X, so its length is three and easy to read back. */
const RESTED = { ...IDENTITY_TRANSFORM, position: { x: 3, y: 0, z: 0 } }

const FREE: readonly BoneAxis[] = []

const at = (x: number, y: number, z: number) => ({
  ...IDENTITY_TRANSFORM,
  position: { x, y, z },
})

describe('what a joint may be moved to', () => {
  it('writes what was asked where nothing is held', () => {
    expect(restWithin(RESTED, at(1, 2, 3), FREE).position).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('puts a held axis back, whichever door asked', () => {
    expect(restWithin(RESTED, at(1, 2, 3), ['y']).position).toEqual({ x: 1, y: 0, z: 3 })
  })

  it('holds every axis it is given, and leaves the others alone', () => {
    expect(restWithin(RESTED, at(1, 2, 3), ['x', 'z']).position).toEqual({ x: 3, y: 2, z: 0 })
  })

  // 🛑 The length is NOT held, and that is the arbitration: posing turns the bone arriving at a
  // joint, so no length changes there, and editing a skeleton is where one shortens a bone that
  // came out too long — holding it would forbid the only gesture that state is for.
  it('lets a joint be moved off its own sphere, which is how a bone is shortened', () => {
    expect(restWithin(RESTED, at(0, 10, 0), FREE).position).toEqual({ x: 0, y: 10, z: 0 })
  })

  it('never touches the rotation of a free axis, nor the scale', () => {
    const turned = { ...at(1, 0, 0), rotation: { x: 0.5, y: 0, z: 0 } }

    expect(restWithin(RESTED, turned, FREE).rotation.x).toBeCloseTo(0.5, 6)
    expect(restWithin(RESTED, turned, FREE).scale).toEqual(turned.scale)
  })

  it('holds a rotation on a held axis, exactly as it holds a position', () => {
    const turned = { ...at(1, 0, 0), rotation: { x: 0.5, y: 0.5, z: 0 } }

    expect(restWithin(RESTED, turned, ['x']).rotation).toEqual({ x: 0, y: 0.5, z: 0 })
  })
})
