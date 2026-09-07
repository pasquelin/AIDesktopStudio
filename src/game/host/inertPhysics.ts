// SPDX-License-Identifier: MIT

import type { CharacterMoved, PhysicsPort } from '../ports/physicsPort'

/**
 * What a host installs while it has no engine. Named rather than hidden: nothing falls, nothing
 * collides, and a `CharacterController` walks exactly where it asked to.
 */
export function createInertPhysics(): PhysicsPort {
  const moved: CharacterMoved[] = []

  return {
    setGravity: () => {},
    add: () => [],
    remove: () => {},
    place: () => {},
    // Grounded, and that is the whole of the fiction: with no engine there is no floor to be off.
    moveCharacters: wanted => {
      moved.length = 0
      for (const one of wanted) moved.push({ body: one.body, moved: one.wanted, grounded: true })
      return moved
    },
    drive: () => {},
    push: () => {},
    motion: () => [],
    // Nothing to be stopped by, so no probe ever is.
    cast: () => null,
    step: () => {},
    poses: () => [],
    contacts: () => [],
    dispose: () => {},
  }
}
