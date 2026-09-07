import { beforeEach, describe, expect, it } from 'vitest'
import { skeletonSignatureOf } from '@shared/domain/skeletonProfile'
import { skeletonProfilesOf, useSkeletonProfiles } from './skeletonProfiles'

const SUMMER = '/projects/Summer'
const WINTER = '/projects/Winter'

const profile = (roles: Record<string, 'Hips' | 'Spine'>, bones = Object.keys(roles)) => ({
  signature: skeletonSignatureOf(bones),
  roles,
})

const held = (path: string) => skeletonProfilesOf(useSkeletonProfiles.getState(), path)

describe('what each project knows about the skeletons it has read', () => {
  beforeEach(() => {
    localStorage.clear()
    useSkeletonProfiles.setState({ byProject: {} })
  })

  it('keeps a mapping under the project it was worked out in, and nowhere else', () => {
    useSkeletonProfiles.getState().rememberSkeletonProfile(SUMMER, profile({ b0: 'Hips' }))

    expect(held(SUMMER)).toHaveLength(1)
    expect(held(WINTER)).toEqual([])
  })

  // The same skeleton corrected twice: the second correction is the one that stands, or the
  // studio would go on retargeting off a mapping the user has already put right.
  it('replaces what it knew of a skeleton it meets again', () => {
    const store = useSkeletonProfiles.getState()
    store.rememberSkeletonProfile(SUMMER, profile({ b0: 'Hips' }))
    store.rememberSkeletonProfile(SUMMER, profile({ b0: 'Spine' }, ['b0']))

    expect(held(SUMMER)).toEqual([
      { signature: skeletonSignatureOf(['b0']), roles: { b0: 'Spine' } },
    ])
  })

  it('answers nothing at all while no project is open', () => {
    expect(skeletonProfilesOf(useSkeletonProfiles.getState(), null)).toEqual([])
  })

  // Read back from a file on disk and handed to the retargeting worker as a mapping: a role that
  // is not one of the fifty-two would be a plan built out of nonsense.
  it('drops a stored profile that is not one, and keeps the rest', async () => {
    localStorage.setItem(
      'ai-desktop-studio:skeleton-profiles',
      JSON.stringify({
        state: {
          byProject: {
            [SUMMER]: {
              good: { signature: 'good', roles: { b0: 'Hips' } },
              bad: { signature: 'bad', roles: { b0: 'Elbow' } },
            },
          },
        },
        version: 0,
      }),
    )

    await useSkeletonProfiles.persist.rehydrate()

    expect(held(SUMMER).map(one => one.signature)).toEqual(['good'])
  })
})
