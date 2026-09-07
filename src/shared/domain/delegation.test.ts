import { describe, expect, it } from 'vitest'
import { ACTION_REGISTRY, needsConfirmation, type ActionName } from './assistant'
import { delegated, type Delegation } from './delegation'
import { DEFAULT_SETTINGS } from './settings'

const armed = (partial: Partial<Delegation> = {}): Delegation => ({
  ...DEFAULT_SETTINGS.mcp,
  ...partial,
})

describe('what may run without the question on screen', () => {
  /** The studio as it was before this existed: nothing armed, everything asked about. */
  it('delegates nothing until somebody arms it', () => {
    const unarmed = DEFAULT_SETTINGS.mcp

    expect(delegated(unarmed, 'files', null, 0)).toBe(false)
    expect(delegated(unarmed, 'asset', null, 0)).toBe(false)
    expect(delegated(unarmed, 'remote', null, 0)).toBe(false)
    expect(delegated(unarmed, 'credits', 1, 0)).toBe(false)
    // A model of this machine is priced at nothing, and nothing armed still means asked about.
    expect(delegated(unarmed, 'credits', 0, 0)).toBe(false)
  })

  it('lets through the levels that were armed, and only those', () => {
    const files = armed({ delegateFiles: true })

    expect(delegated(files, 'files', null, 0)).toBe(true)
    expect(delegated(files, 'asset', null, 0)).toBe(false)
    expect(delegated(files, 'remote', null, 0)).toBe(false)
  })

  it('spends up to the budget and stops there', () => {
    const budget = armed({ delegateBudget: 10 })

    expect(delegated(budget, 'credits', 4, 0)).toBe(true)
    expect(delegated(budget, 'credits', 4, 6)).toBe(true)
    // Six already spent and five more asked for is eleven, which is past ten.
    expect(delegated(budget, 'credits', 5, 6)).toBe(false)
  })

  /**
   * The rule that matters most: the API declines to price some models, and a ceiling cannot bound
   * a cost nobody knows. An unpriced spend is asked about however high the budget was set.
   */
  it('never delegates a spend the API declined to price', () => {
    expect(delegated(armed({ delegateBudget: 10_000 }), 'credits', null, 0)).toBe(false)
  })

  // Not reached — `needsConfirmation` is false for it — and answered rather than left to a default.
  it('lets an action that engages nothing through whatever is armed', () => {
    expect(delegated(DEFAULT_SETTINGS.mcp, 'none', null, 0)).toBe(true)
  })
})

/**
 * 🛑 A project may not be binned without somebody reading the card first. `files` would NOT have
 * held it: anyone who armed `delegateFiles` to move rushes about would have had a whole project
 * folder go unasked. Guarded as a PAIR — the cheap mistake is to publish one at the other's level.
 */
describe('what a project gesture may never run unasked', () => {
  const everythingArmed: Delegation = armed({
    delegateFiles: true,
    delegateAsset: true,
    delegateRemote: true,
    delegateBudget: Number.MAX_SAFE_INTEGER,
  })

  const PAIR: readonly ActionName[] = ['project.forget', 'project.trash']

  it.each(PAIR)('always asks before %s', name => {
    const action = ACTION_REGISTRY.find(entry => entry.name === name)

    expect(action?.commitment).toBe('studio')
    expect(needsConfirmation(action?.commitment ?? 'none')).toBe(true)
    expect(delegated(everythingArmed, action?.commitment ?? 'none', null, 0)).toBe(false)
  })
})
