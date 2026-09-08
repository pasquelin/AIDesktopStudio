import { describe, expect, it } from 'vitest'
import { reasonsToRefuse, staleLinks, type MergeState } from './mergeGuard'

const READY: MergeState = {
  branch: 'feat/something',
  dirty: [],
  hostDirty: [],
  rebased: true,
  stale: () => [],
}

const LINK = { command: 'pnpm typecheck', reads: ['src'] }

describe('the merge that has to prove itself first', () => {
  it('names the links the cache cannot vouch for', () => {
    expect(staleLinks([LINK], () => true)).toEqual([])
    expect(staleLinks([LINK], () => false)).toEqual(['pnpm typecheck'])
  })

  it('lets a rebased branch through when the gate is green on this very content', () => {
    expect(reasonsToRefuse(READY, 'develop')).toEqual([])
  })

  it('gives every reason it has, rather than the first one it meets', () => {
    const reasons = reasonsToRefuse(
      { ...READY, dirty: ['src/a.ts'], hostDirty: ['pnpm-lock.yaml'], rebased: false },
      'develop',
    )

    expect(reasons.join('\n')).toContain('src/a.ts')
    expect(reasons.join('\n')).toContain('pnpm-lock.yaml')
    expect(reasons.join('\n')).toContain('not sitting on develop')
  })

  /**
   * Hashing the tree costs a second and a dirty tree is refused whatever it says, so the gate is
   * asked last and only when nothing cheaper has already spoken.
   */
  it('does not ask the cache when a cheaper reason already refuses', () => {
    let asked = false
    const state = { ...READY, dirty: ['src/a.ts'], stale: () => ((asked = true), []) }

    expect(reasonsToRefuse(state, 'develop')).toHaveLength(1)
    expect(asked).toBe(false)
  })

  it('refuses to merge the integration branch into itself', () => {
    expect(reasonsToRefuse({ ...READY, branch: 'develop' }, 'develop').join()).toContain('develop')
  })
})
