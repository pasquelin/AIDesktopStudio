import { describe, expect, it } from 'vitest'
import { reasonsToRefuse, staleLinks, type MergeState } from './mergeGuard'

const READY: MergeState = {
  branch: 'feat/something',
  dirty: [],
  hostDirty: [],
  rebased: true,
  stale: [],
}

const LINK = { command: 'pnpm typecheck', reads: ['src'] }

describe('what the cache already knows about a revision', () => {
  it('calls a link stale when the tree no longer matches the verdict it was green on', () => {
    const now = () => 'after'

    expect(staleLinks([LINK], now, () => 'after')).toEqual([])
    expect(staleLinks([LINK], now, () => 'before')).toEqual(['pnpm typecheck'])
  })

  /** Never run is not green, and a link with no marker is the case a fresh clone lands in. */
  it('calls a link stale when it has never been green here at all', () => {
    expect(
      staleLinks(
        [LINK],
        () => 'now',
        () => undefined,
      ),
    ).toEqual(['pnpm typecheck'])
  })
})

describe('the merge that has to prove itself first', () => {
  it('lets a rebased branch through when the gate is green on this very content', () => {
    expect(reasonsToRefuse(READY, 'develop')).toEqual([])
  })

  /**
   * All of them at once, not the first: a script that stops on one reason sends its reader round
   * the loop as many times as there are reasons.
   */
  it('gives every reason it has, rather than the first one it meets', () => {
    const reasons = reasonsToRefuse(
      {
        ...READY,
        dirty: ['src/a.ts'],
        hostDirty: ['pnpm-lock.yaml'],
        rebased: false,
        stale: ['pnpm test'],
      },
      'develop',
    )

    expect(reasons).toHaveLength(4)
    expect(reasons.join('\n')).toContain('pnpm test')
    expect(reasons.join('\n')).toContain('pnpm-lock.yaml')
  })

  it('refuses to merge the integration branch into itself', () => {
    expect(reasonsToRefuse({ ...READY, branch: 'develop' }, 'develop')).toHaveLength(1)
  })
})
