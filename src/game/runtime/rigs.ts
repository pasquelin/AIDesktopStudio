// SPDX-License-Identifier: MIT

import type { Entity } from './entity'

/**
 * The camera node a spring arm drives, handed from `springArm` to the system that films.
 * 🛑 The player module's own eye wins; failing one, the FIRST arm of the sweep does — an author
 * with two and no module turns one off by clearing its `camera`.
 */
export type Rigs = {
  /** The node, and the lens it is seen through in degrees — the runtime holds no camera. */
  take: (camera: Entity, lens: number) => void
  leader: () => Entity | null
  /** The leader's lens. Read once the shot is composed, never before a `take`. */
  lens: () => number
  /** Emptied once the shot is composed, so an arm destroyed mid-game stops being filmed. */
  release: () => void
}

export function createRigs(preferred: string | null): Rigs {
  let held: Entity | null = null
  let lens = 0

  return {
    take: (camera, through) => {
      // Which arm the sweep met first is not a choice an author can see, let alone make.
      if (held !== null && camera.id !== preferred) return
      held = camera
      lens = through
    },
    leader: () => held,
    lens: () => lens,
    release: () => {
      held = null
    },
  }
}
