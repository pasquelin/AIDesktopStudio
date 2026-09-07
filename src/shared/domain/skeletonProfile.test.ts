import { describe, expect, it } from 'vitest'
import type { HumanoidRole } from './humanoid'
import {
  isSkeletonProfile,
  profileWithRole,
  skeletonSignatureOf,
  skeletonTopologySignatureOf,
  type SkeletonProfile,
} from './skeletonProfile'

const UTHANA = ['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Head']

function profileOf(roles: Record<string, HumanoidRole>): SkeletonProfile {
  return { signature: skeletonSignatureOf(UTHANA), roles }
}

describe('recognising a skeleton', () => {
  it('answers the same for two files listing the same bones in any order', () => {
    expect(skeletonSignatureOf([...UTHANA].reverse())).toBe(skeletonSignatureOf(UTHANA))
  })

  it('answers differently for a skeleton one bone apart', () => {
    expect(skeletonSignatureOf([...UTHANA, 'mixamorig:Neck'])).not.toBe(skeletonSignatureOf(UTHANA))
  })

  it('tells two rigs of the same size apart', () => {
    expect(skeletonSignatureOf(['Hip', 'Waist'])).not.toBe(skeletonSignatureOf(['Hips', 'Spine']))
  })

  it('counts a name repeated in a file once, since only one bone answers to it', () => {
    expect(skeletonSignatureOf(['Hips', 'Hips', 'Spine'])).toBe(
      skeletonSignatureOf(['Hips', 'Spine']),
    )
  })
})

describe('correcting a mapping by hand', () => {
  it('takes the role off whatever bone was holding it', () => {
    const corrected = profileWithRole(profileOf({ Wrist_L: 'LeftHand' }), 'Palm_L', 'LeftHand')

    expect(corrected.roles).toEqual({ Palm_L: 'LeftHand' })
  })

  it('leaves the rest of the mapping alone', () => {
    const corrected = profileWithRole(
      profileOf({ Hip: 'Hips', Wrist_L: 'LeftHand' }),
      'Palm_L',
      'LeftHand',
    )

    expect(corrected.roles.Hip).toBe('Hips')
  })

  it('clears a role a bone should never have had', () => {
    const corrected = profileWithRole(profileOf({ Hip: 'Hips', Pelvis: 'Spine' }), 'Pelvis', null)

    expect(corrected.roles).toEqual({ Hip: 'Hips' })
  })

  it('keeps the skeleton it describes', () => {
    const profile = profileOf({ Hip: 'Hips' })

    expect(profileWithRole(profile, 'Head', 'Head').signature).toBe(profile.signature)
  })
})

describe('reading a profile back', () => {
  it('accepts one the studio wrote', () => {
    expect(isSkeletonProfile(profileOf({ Hip: 'Hips' }))).toBe(true)
  })

  it('refuses a mapping naming a role that does not exist', () => {
    expect(isSkeletonProfile({ signature: 'x', roles: { Hip: 'Tail' } })).toBe(false)
  })

  it('refuses one with no signature to recognise it by', () => {
    expect(isSkeletonProfile({ signature: '', roles: {} })).toBe(false)
  })
})

it('distinguishes topology while remaining independent of bone order', () => {
  const bones = [
    { name: 'Hips', parent: null },
    { name: 'Head', parent: 'Hips' },
  ]
  expect(skeletonTopologySignatureOf(bones)).toBe(skeletonTopologySignatureOf([...bones].reverse()))
  expect(skeletonTopologySignatureOf(bones)).not.toBe(
    skeletonTopologySignatureOf(bones.map(bone => ({ ...bone, parent: null }))),
  )
})
it('rejects a persisted role assigned to two bones', () => {
  expect(isSkeletonProfile(profileOf({ Hip: 'Hips', Pelvis: 'Hips' }))).toBe(false)
})

it('rejects a non-finite rest pose before it reaches the sampler', () => {
  expect(
    isSkeletonProfile({
      signature: 'x',
      roles: {},
      restPose: {
        Hips: {
          position: { x: NaN, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
      },
    }),
  ).toBe(false)
})
