// SPDX-License-Identifier: MIT

import type { ComponentType } from '@shared/domain/component'

export type SystemName =
  | 'input'
  | 'script'
  | 'movement'
  | 'path'
  | 'patrol'
  | 'follow'
  | 'orbit'
  | 'spin'
  | 'lookAt'
  | 'vehicle'
  | 'aircraft'
  | 'possession'
  | 'physics'
  | 'collision'
  | 'gameplay'
  | 'animator'
  | 'audio'
  | 'timeline'
  | 'springArm'
  | 'camera'

/**
 * The order a step runs its systems in, declared once rather than left to whoever registers last.
 *
 * 🛑 It is a CONTRACT, not a convenience: physics after movement is why a wall stops a walker,
 * and the camera last is why it does not follow a position the physics then corrects. A script's
 * `onLateUpdate` runs in the `script` system's late pass, which is after all of this.
 *
 * 🛑 The six travelling systems sit between `movement` and `physics`, and `lookAt` last of them:
 * it turns towards where a thing STANDS, so it must hear whatever moved it this step. They all
 * write TRANSFORMS, which `writeConflicts` cannot name — its table holds component types, and
 * `physics` and `movement` were already blind to each other for the same reason.
 *
 * 🛑 `vehicle` and `aircraft` sit just BEFORE `physics` because they write into the ENGINE, not
 * into a transform: a pedal handed over after the step is a pedal the step never heard.
 *
 * 🛑 `springArm` sits just before `camera`, and both work in the LATE pass: an arm places the
 * camera node of the frame being drawn, and the camera films through it on the same frame.
 *
 * 🛑 `possession` sits just BEFORE `physics` so a ridden body is frozen before the step asks it
 * what it wants — and it carries that body in the LATE pass, where what it rides has already
 * been moved and the arm has not yet read where it stands.
 */
export const SYSTEM_ORDER: readonly SystemName[] = [
  'input',
  'script',
  'movement',
  'path',
  'patrol',
  'follow',
  'orbit',
  'spin',
  'lookAt',
  'vehicle',
  'aircraft',
  'possession',
  'physics',
  'collision',
  'gameplay',
  'animator',
  'audio',
  'timeline',
  'springArm',
  'camera',
]

/** Just enough of a system to be ordered and to be checked. */
export type SystemShape = {
  name: SystemName
  reads: readonly ComponentType[]
  writes: readonly ComponentType[]
}

/**
 * The same systems, in the declared order. Two of one name keep the order they were given in.
 *
 * A name `SYSTEM_ORDER` does not list runs LAST rather than first: `indexOf` answers -1, and the
 * natural edit — a name added to `SystemName`, the list forgotten — would otherwise put it ahead
 * of `input`. `systemOrder.test.ts` holds the two lists together by the compiler.
 */
export function orderedByDeclaration<T extends SystemShape>(systems: readonly T[]): T[] {
  const rank = (name: SystemName): number => {
    const at = SYSTEM_ORDER.indexOf(name)
    return at < 0 ? SYSTEM_ORDER.length : at
  }

  return [...systems].sort((one, other) => rank(one.name) - rank(other.name))
}

/**
 * The component types more than one system writes.
 *
 * A read after a write is the DESIGN — a system reading what an earlier one wrote is how a step
 * composes. Two writers is not: which one wins depends on the order, and the order is not a thing
 * a component's owner declared.
 */
export function writeConflicts(systems: readonly SystemShape[]): ComponentType[] {
  const writers = new Map<ComponentType, Set<SystemName>>()
  for (const system of systems)
    // By NAME, not by count: a system listing one type twice in its own `writes` is careless, not
    // a conflict, and counting occurrences reported it as one.
    for (const type of system.writes)
      writers.set(type, (writers.get(type) ?? new Set()).add(system.name))

  return [...writers].filter(([, names]) => names.size > 1).map(([type]) => type)
}
