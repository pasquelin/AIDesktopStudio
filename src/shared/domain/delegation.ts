import type { ActionCommitment } from './assistantAction'
import type { Settings } from './settings'

/**
 * Whether an action may run without the question on screen.
 *
 * The one piece of the delegation that decides anything, and it is pure: what it answers has to be
 * checkable without a window, because what it answers is whether a machine may spend somebody's
 * money while they are not looking.
 *
 * 🛑 It is no longer the only door. A call from the wire that this refuses comes back with a
 * consent token, and the same call sent back with it runs — see `wireConsent.ts`. What the two
 * doors share is the ledger: a spend passed by token is debited here too, or a ceiling armed on
 * one door would be spent through the other.
 *
 * Three rules, and none of them is a convenience:
 *
 * - Nothing is delegated unless the person armed it. Every field defaults to off or to zero.
 * - A spend the API declined to PRICE is never delegated, whatever the budget holds. An unknown
 *   cost is an unbounded one, and a ceiling cannot bound it.
 * - The budget is what is left, not what was set: it is measured against what this window has
 *   already spent unasked, so ten calls of one unit each are ten units and not one.
 */
export type Delegation = Settings['mcp']

export function delegated(
  mcp: Delegation,
  commitment: ActionCommitment,
  estimate: number | null,
  spent: number,
): boolean {
  switch (commitment) {
    // Never reaches here — `needsConfirmation` is false for it — and answered anyway rather than
    // left to a default that would one day catch something else.
    case 'none':
      return true
    case 'files':
      return mcp.delegateFiles
    case 'asset':
      return mcp.delegateAsset
    case 'remote':
      return mcp.delegateRemote
    // No switch arms this one, deliberately: what it changes is which account answers and which
    // project is open, and a checkbox that waves those through is a checkbox nobody should have.
    // A token still passes it, one call at a time and never standing — that is the whole point.
    case 'studio':
      return false
    // A zero budget delegates nothing, a run priced at nothing included: a model of this machine
    // is priced at 0 since 2026-09-06, and `0 <= 0` would have waved it through unasked.
    case 'credits':
      return estimate !== null && mcp.delegateBudget > 0 && spent + estimate <= mcp.delegateBudget
  }
}
