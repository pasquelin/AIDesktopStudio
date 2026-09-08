import type { GateLink } from './gateLinks'

/**
 * Whether a link's last green verdict still describes the tree as it stands.
 *
 * The gate's markers already hold the fingerprint each link was green on, so proving the gate
 * green on a revision costs a hash rather than a run. That is the whole guard: a merge asks the
 * cache what it knows, and refuses when the answer is "not this content".
 */
export function staleLinks(
  links: readonly GateLink[],
  fingerprintOf: (link: GateLink) => string,
  greenOn: (link: GateLink) => string | undefined,
): string[] {
  return links.filter(link => greenOn(link) !== fingerprintOf(link)).map(link => link.command)
}

export type MergeState = {
  readonly branch: string
  /** Paths git reports as modified, staged or untracked. A merge must carry what was judged. */
  readonly dirty: readonly string[]
  /** The same, in the checkout that holds the integration branch: a merge lands THERE. */
  readonly hostDirty: readonly string[]
  /** Whether the branch sits directly on the tip it merges into. */
  readonly rebased: boolean
  readonly stale: readonly string[]
}

/**
 * Why a merge must not happen, in the order a reader can act on: the tree first, then the shape of
 * the history, then the gate. Empty means it may.
 *
 * Written as a list rather than a throw so the caller prints all of it at once — a script that
 * stops on the first reason sends its reader round the loop three times.
 */
export function reasonsToRefuse(state: MergeState, into: string): string[] {
  const reasons: string[] = []

  if (state.branch === into) {
    reasons.push(`Nothing to merge: this checkout is already on ${into}.`)
  }
  if (state.dirty.length > 0) {
    reasons.push(
      `The tree carries ${state.dirty.length} uncommitted change(s), which the gate did not judge:\n` +
        state.dirty.map(path => `    ${path}`).join('\n'),
    )
  }
  if (state.hostDirty.length > 0) {
    reasons.push(
      `The checkout holding ${into} carries ${state.hostDirty.length} uncommitted change(s).\n` +
        state.hostDirty.map(path => `    ${path}`).join('\n') +
        '\n  A merge lands there, and git would either refuse or bury them.',
    )
  }
  if (!state.rebased) {
    reasons.push(
      `${state.branch} is not sitting on ${into}. Rebase first — a gate green on an older tip\n` +
        `  says nothing about the merge result, which is what CI will read.`,
    )
  }
  if (state.stale.length > 0) {
    reasons.push(
      `The gate is not green on THIS content. Never run, or run before the last edit:\n` +
        state.stale.map(command => `    ${command}`).join('\n') +
        '\n  Run `pnpm validate` and merge again.',
    )
  }
  return reasons
}
