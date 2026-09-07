import { expect, it } from 'vitest'
import { namedBonesOf } from '@/engines/scene/retarget'
import {
  skeletonSignatureOf,
  skeletonTopologySignatureOf,
  type SkeletonProfile,
} from '@shared/domain/skeletonProfile'
import type { WireBone } from '@/engines/scene/retargetMessage'
import { confirmedProfiles, profileForView } from './retargetProfileDraft'

const bone = (name: string, parent: number): WireBone => ({
  name,
  parent,
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
  scale: [1, 1, 1],
})

const BONES: WireBone[] = [bone('Hips', -1), bone('Spine', 0), bone('root_02', 1)]

/**
 * 🛑 v1.0.0 filed corrections under the names alone, and those files are on real machines. The
 * profile carries no hierarchy, so a v2 identity can only be computed when the skeleton is read.
 */
it('reads a v1 profile back under its v2 identity, losing no correction', () => {
  const legacy: SkeletonProfile = {
    signature: skeletonSignatureOf(BONES.map(one => one.name)),
    provider: 'Mixamo',
    roles: { root_02: 'Neck' },
    ignored: ['Spine'],
    restPose: {
      Hips: {
        position: { x: 0, y: 1, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    },
  }

  const read = profileForView({ bones: BONES }, [legacy])

  expect(read).toEqual({
    ...legacy,
    signature: skeletonTopologySignatureOf(namedBonesOf(BONES)),
  })
  expect(confirmedProfiles(read, null)).toEqual([read])
})

it('detects roles from the names when nothing was ever recorded', () => {
  const detected = profileForView({ bones: BONES })

  expect(detected?.signature).toBe(skeletonTopologySignatureOf(namedBonesOf(BONES)))
  expect(detected?.roles.Hips).toBe('Hips')
})
