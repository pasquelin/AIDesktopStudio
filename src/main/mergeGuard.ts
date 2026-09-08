import type { GateLink } from './gateLinks'

/**
 * The links whose last green verdict no longer describes the tree.
 *
 * The gate's markers already hold the fingerprint each link was green on, so proving the gate green
 * on a revision costs a hash rather than a run. That is the whole guard: a merge asks the cache
 * what it knows, and refuses when the answer is "not this content".
 */
export function staleLinks(
  links: readonly GateLink[],
  isGreen: (link: GateLink) => boolean,
): string[] {
  return links.filter(link => !isGreen(link)).map(link => link.command)
}

export type MergeState = {
  readonly branch: string
  /** What the integration checkout actually has out, which is where a merge lands. */
  readonly hostBranch: string
  /** Paths git reports as modified, staged or untracked. A merge must carry what was judged. */
  readonly dirty: readonly string[]
  /** The same, in the checkout that holds the integration branch: a merge lands THERE. */
  readonly hostDirty: readonly string[]
  /** Whether the branch sits directly on the tip it merges into. */
  readonly rebased: boolean
  /**
   * Deferred on purpose: hashing the tree costs a second, the three reasons above cost a git call
   * each, and a dirty tree is refused whatever the cache says.
   */
  readonly stale: () => readonly string[]
}

const listed = (headline: string, items: readonly string[], advice?: string): string =>
  `${headline}\n${items.map(item => `    ${item}`).join('\n')}${advice === undefined ? '' : `\n  ${advice}`}`

/**
 * The reasons a git call answers, in the order a reader can act on: the tree first, then the shape
 * of the history. All of them at once rather than a throw on the first — a script that stops on one
 * sends its reader round the loop as many times as there are reasons.
 */
function cheapReasons(state: MergeState, into: string): string[] {
  const reasons: string[] = []

  if (state.branch === into) reasons.push(`Nothing to merge: this checkout is already on ${into}.`)
  if (state.hostBranch !== into) {
    // A merge lands on whatever the main checkout has out, and during a release that is `main` —
    // where `git.md` forbids a feature. Every other reason passes there, so nothing else says it.
    reasons.push(
      `The main checkout is on ${state.hostBranch}, not ${into}. A merge would land THERE.` +
        `\n  Put it back on ${into} first; a feature never goes to main.`,
    )
  }
  if (state.dirty.length > 0) {
    reasons.push(
      listed(
        `The tree carries ${state.dirty.length} uncommitted change(s), which the gate did not judge:`,
        state.dirty,
      ),
    )
  }
  // Untracked files are dropped here: git refuses to overwrite one rather than bury it, so a
  // stray folder in the integration checkout is not a reason to stop. In the FEATURE tree they
  // are kept — there they are work the commit does not carry.
  const landedOn = state.hostDirty.filter(line => !line.startsWith('??'))
  if (landedOn.length > 0) {
    reasons.push(
      listed(
        `The checkout holding ${into} carries ${landedOn.length} uncommitted change(s):`,
        landedOn,
        'A merge lands there, and git would either refuse or bury them.',
      ),
    )
  }
  if (!state.rebased) {
    reasons.push(
      `${state.branch} is not sitting on ${into}. Rebase first — a gate green on an older tip\n` +
        `  says nothing about the merge result, which is what CI will read.`,
    )
  }
  return reasons
}

/** Why a merge must not happen. Empty means it may. */
export function reasonsToRefuse(state: MergeState, into: string): string[] {
  const cheap = cheapReasons(state, into)
  if (cheap.length > 0) return cheap

  const stale = state.stale()
  return stale.length === 0
    ? []
    : [
        listed(
          'The gate is not green on THIS content. Never run, or run before the last edit:',
          stale,
          'Run `pnpm validate` and merge again.',
        ),
      ]
}
