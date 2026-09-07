// SPDX-License-Identifier: MIT

/**
 * The bodies a player is riding something else with, and which are therefore not walking. Shared
 * the way `pilots` is: `possession` says who is held, `characters` reads it before asking for a
 * move — a held body asks for nothing at all, neither pace nor gravity.
 */
export type Possessions = {
  hold: (bodyId: string) => void
  holds: (bodyId: string) => boolean
  /** Called at the top of each resolution: a rider who got out is free on the very next step. */
  release: () => void
}

export function createPossessions(): Possessions {
  const held = new Set<string>()

  return {
    hold: bodyId => {
      held.add(bodyId)
    },
    holds: bodyId => held.has(bodyId),
    release: () => held.clear(),
  }
}
