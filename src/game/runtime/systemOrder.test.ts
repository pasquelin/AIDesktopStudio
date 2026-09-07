// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import {
  orderedByDeclaration,
  SYSTEM_ORDER,
  writeConflicts,
  type SystemName,
  type SystemShape,
} from './systemOrder'

/**
 * The compiler holds the two lists together: a name added to `SystemName` and forgotten in
 * `SYSTEM_ORDER` does not compile here. Nothing else would notice — the system would simply run
 * out of order, which is the one thing the order exists to prevent.
 */
const EVERY_NAME: Record<SystemName, true> = {
  input: true,
  script: true,
  movement: true,
  path: true,
  patrol: true,
  follow: true,
  orbit: true,
  spin: true,
  lookAt: true,
  vehicle: true,
  aircraft: true,
  possession: true,
  physics: true,
  collision: true,
  gameplay: true,
  animator: true,
  audio: true,
  timeline: true,
  springArm: true,
  camera: true,
}

const system = (name: SystemShape['name'], writes: SystemShape['writes'] = []): SystemShape => ({
  name,
  reads: [],
  writes,
})

describe('the order a step runs its systems in', () => {
  it('puts them back in the declared order, whatever order they were given in', () => {
    const given = [system('camera'), system('input'), system('physics'), system('script')]

    expect(orderedByDeclaration(given).map(one => one.name)).toEqual([
      'input',
      'script',
      'physics',
      'camera',
    ])
  })

  it('names every system exactly once, and every one there is', () => {
    expect(new Set(SYSTEM_ORDER).size).toBe(SYSTEM_ORDER.length)
    expect([...SYSTEM_ORDER].sort()).toEqual(Object.keys(EVERY_NAME).sort())
  })

  /**
   * A read after a write is how a step composes. Two WRITERS is not: which one wins depends on an
   * order nobody declared for that component.
   */
  it('names the components two systems both write', () => {
    expect(
      writeConflicts([system('movement', ['Movement']), system('physics', ['Movement'])]),
    ).toEqual(['Movement'])
    expect(
      writeConflicts([system('movement', ['Movement']), system('gameplay', ['Health'])]),
    ).toEqual([])
  })
})
