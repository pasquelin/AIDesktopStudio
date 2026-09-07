import { describe, expect, it } from 'vitest'
import type { Rig } from '@shared/domain/rig'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import type { Bounds } from '../scene/rigFit'
import { rigTransferFaultOf, rigTransferred } from './rigTransfer'

const BODY: Bounds = { min: { x: -0.3, y: 0, z: -0.2 }, max: { x: 0.3, y: 1.8, z: 0.2 } }
const TWICE: Bounds = { min: { x: -0.6, y: 0, z: -0.4 }, max: { x: 0.6, y: 3.6, z: 0.4 } }

const at = (y: number) => ({ ...IDENTITY_TRANSFORM, position: { x: 0, y, z: 0 } })

/** Hips, a spine above them, a tail the fitter would never lay, and fingers it stops short of. */
const DONOR: Rig = {
  origin: 'local',
  bones: [
    { name: 'Hips', parent: null, rest: at(0.9), role: 'Hips' },
    { name: 'Spine', parent: 'Hips', rest: at(0.2), role: 'Spine' },
    { name: 'Tail', parent: 'Hips', rest: at(-0.1) },
    { name: 'LeftThumb1', parent: 'Spine', rest: at(0.05), role: 'LeftThumb1' },
  ],
}

describe('taking the skeleton of another character', () => {
  it('is a copy: editing the donor afterwards touches nothing of it', () => {
    const taken = rigTransferred(DONOR, BODY, BODY)

    expect(taken?.bones).not.toBe(DONOR.bones)
    expect(taken?.bones[0]).not.toBe(DONOR.bones[0])
  })

  it('stands a twice-as-tall body on a twice-as-tall skeleton', () => {
    const taken = rigTransferred(DONOR, BODY, TWICE)

    expect(taken?.bones.find(one => one.name === 'Hips')?.rest.position.y).toBeCloseTo(1.8, 5)
    expect(taken?.bones.find(one => one.name === 'Spine')?.rest.position.y).toBeCloseTo(0.4, 5)
  })

  // A skeleton standing where the donor's did sinks into a shorter body and floats over a taller.
  it('puts the feet on the receiver’s own floor', () => {
    const raised: Bounds = { ...BODY, min: { ...BODY.min, y: 1 }, max: { ...BODY.max, y: 2.8 } }
    const taken = rigTransferred(DONOR, BODY, raised)

    expect(taken?.bones.find(one => one.name === 'Hips')?.rest.position.y).toBeCloseTo(1.9, 5)
  })

  // What `rigFit` cannot do at all: it lays twenty-two bones and knows of no other.
  it('carries a tail and a finger across, which a fit would never lay', () => {
    const taken = rigTransferred(DONOR, BODY, TWICE)

    expect(taken?.bones.map(one => one.name)).toContain('Tail')
    expect(taken?.bones.find(one => one.name === 'LeftThumb1')?.role).toBe('LeftThumb1')
  })

  it('says the copy came from elsewhere, never that this studio fitted it', () => {
    expect(rigTransferred(DONOR, BODY, TWICE)?.origin).toBe('imported')
  })

  it('refuses a body with no height to measure, and says which of the two fails', () => {
    const flat: Bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 1 } }

    expect(rigTransferFaultOf(DONOR, BODY, flat)).toBe('no-height')
    expect(rigTransferFaultOf(null, BODY, TWICE)).toBe('empty')
    expect(rigTransferred(DONOR, BODY, flat)).toBeNull()
  })
})
