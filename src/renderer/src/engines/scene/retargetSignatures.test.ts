import { describe, expect, it, vi } from 'vitest'
import type * as Hash from '@shared/hash'
import type { SkeletonProfile } from '@shared/domain/skeletonProfile'

const { digests } = vi.hoisted(() => ({ digests: vi.fn() }))

// The real digest, counted: what this file is about is HOW OFTEN it is asked for, and a fake one
// would let a wrong signature pass unnoticed.
vi.mock('@shared/hash', async importOriginal => {
  const held = await importOriginal<typeof Hash>()
  return {
    ...held,
    digest: (value: string): string => {
      digests(value)
      return held.digest(value)
    },
  }
})

const { namedBonesOf, profileOfBones } = await import('./retargetSignatures')
const { skeletonTopologySignatureOf } = await import('@shared/domain/skeletonProfile')
const { UTHANA } = await import('./retarget-fixtures')

const profileOf = (bones: typeof UTHANA): ReadonlyMap<string, SkeletonProfile> =>
  new Map([
    [
      skeletonTopologySignatureOf(namedBonesOf(bones)),
      { signature: 'stored', roles: { Hips: 'Hips' } } satisfies SkeletonProfile,
    ],
  ])

describe('the fingerprints one set of bones is looked up by', () => {
  /**
   * 🛑 One `adapt` asks for them around thirty-five times for four distinct sets of bones —
   * `alignedBonesOf` twice, `profileOfBones` before and after the round trip, `rolesOf` under
   * `fitOf`. Measured at 0,133 ms the digest on sixty-five bones, so the repetition alone was the
   * greater part of the synchronous prelude a transfer pays on the interface thread.
   */
  it('digests a set of bones once, however many times it is looked up', () => {
    const known = profileOf(UTHANA)
    digests.mockClear()

    const first = profileOfBones(UTHANA, known)
    const asked = digests.mock.calls.length
    for (let index = 0; index < 10; index += 1) profileOfBones(UTHANA, known)

    expect(asked).toBeGreaterThan(0)
    expect(digests).toHaveBeenCalledTimes(asked)
    expect(first?.signature).toBe('stored')
  })

  // 🛑 The identity of the ARRAY is the key, not what it holds: a set of bones is built once and
  // never written to, and a content key would cost the very digest this saves.
  it('digests a second reading of the same skeleton again, being another array', () => {
    const known = profileOf(UTHANA)
    profileOfBones(UTHANA, known)
    digests.mockClear()

    expect(profileOfBones([...UTHANA], known)?.signature).toBe('stored')
    expect(digests.mock.calls.length).toBeGreaterThan(0)
  })

  // The name-only door of v1.0.0 is reached only when the topology one misses — and it, too, is
  // asked for once.
  it('reaches the name-only identity once when nothing answers the topology one', () => {
    const known: ReadonlyMap<string, SkeletonProfile> = new Map()
    const bones = [...UTHANA]
    digests.mockClear()

    expect(profileOfBones(bones, known)).toBeUndefined()
    const asked = digests.mock.calls.length
    profileOfBones(bones, known)

    expect(asked).toBe(2)
    expect(digests).toHaveBeenCalledTimes(2)
  })
})
