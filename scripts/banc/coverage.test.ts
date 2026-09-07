import { describe, expect, it } from 'vitest'
import { ACTION_REGISTRY, type ActionName } from '@shared/domain/assistant'
import { COVERAGE, rankOf, uncoveredActions } from './coverage'
import { SCENARIOS } from './scenarios'

/**
 * 🛑 A tool the batterie never reaches is a tool nobody has seen work. `coverage.ts`'s `Record`
 * stops an action being added without an answer; what is left here is a rank naming no scenario,
 * and the roll of what is measured by nothing — written out, because a count hides a swap.
 */

/**
 * Actions no request exercises — empty, and to stay empty. 🛑 A list and not a count, so an
 * action added with `[]` turns the gate red by NAME rather than by a number nobody can act on.
 */
/**
 * 🛑 Measured by nothing, and said so rather than borrowed from a neighbouring rank: reopening a
 * motion wants an asset this studio wrote a band into, which no decor lays.
 */
const AWAITING: readonly ActionName[] = ['animation.reopenMotion']

describe('the MCP surface and the batterie', () => {
  /**
   * 🛑 The whole REGISTRY, not the MCP wire: the bench drives `runConfirmedAction`, so an action
   * the wire never carries still has to answer for itself here.
   */
  it('names every action the registry holds', () => {
    const held = ACTION_REGISTRY.map(one => one.name)
    const named = Object.keys(COVERAGE)

    expect([...named].sort()).toEqual([...held].sort())
  })

  it('cites only ranks the batterie actually carries', () => {
    const ranks = new Set(SCENARIOS.map(one => rankOf(one.name)))
    const ghosts = Object.entries(COVERAGE).flatMap(([action, cited]) =>
      cited.filter(rank => !ranks.has(rank)).map(rank => `${action} → ${rank}`),
    )

    expect(ghosts).toEqual([])
  })

  // Sorted on both sides: the table reads in registry order, which is worth keeping, and a
  // reordering there is not a coverage change.
  it('leaves exactly these actions measured by nothing', () => {
    expect([...uncoveredActions()].sort()).toEqual([...AWAITING].sort())
  })
})
