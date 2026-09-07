// SPDX-License-Identifier: MIT

import type { Entity } from './entity'

/**
 * What the camera watches, how far under it the ground stands, and how far behind it a chase
 * camera belongs — a nine-metre plane watched from a shoulder is watched from inside its own tail.
 */
type Pilot = { entity: Entity; below: number; back: number }

/** Who wins the seat when a scene holds both: a walker is what the player IS, a car what it drives. */
export const PILOT_RANK = { walker: 0, machine: 1 }

/**
 * The one seat the camera reads. 🛑 The camera RELEASES it once it has looked, so a seat nobody
 * claimed on the next frame is empty rather than holding a destroyed entity for ever.
 */
export type Pilots = {
  take: (entity: Entity, below: number, back: number, rank: number) => void
  leader: () => Pilot | null
  release: () => void
}

export function createPilots(): Pilots {
  let held: Pilot | null = null
  let bestRank = 0

  return {
    take: (entity, below, back, rank) => {
      if (held && rank >= bestRank) return

      held = { entity, below, back }
      bestRank = rank
    },
    leader: () => held,
    release: () => {
      held = null
    },
  }
}
