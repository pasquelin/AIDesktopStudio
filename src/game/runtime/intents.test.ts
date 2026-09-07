// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { createIntents } from './intents'

describe('what a script asks of a body', () => {
  it('answers nothing for a body nobody spoke for', () => {
    const intents = createIntents()

    expect(intents.walkOf('a')).toBeNull()
    expect(intents.jumped('a')).toBe(false)
    expect(intents.driveOf('a')).toBeNull()
    expect(intents.flyOf('a')).toBeNull()
  })

  /** 🛑 The z of a script and the y of a stick both go backwards — normalised on the way in. */
  it('hands a walk back in the shape a stick speaks', () => {
    const intents = createIntents()

    intents.walk('a', 1, -2)

    expect(intents.walkOf('a')).toEqual({ x: 1, y: -2 })
  })

  it('keeps one body apart from another', () => {
    const intents = createIntents()

    intents.drive('a', 1, 0, false)

    expect(intents.driveOf('b')).toBeNull()
  })

  /** Last writer wins: two scripts on one body resolve by entity order, which nothing shows. */
  it('keeps the last ask when two of them name the same body', () => {
    const intents = createIntents()

    intents.walk('a', 0, 0)
    intents.walk('a', 1, 0)

    expect(intents.walkOf('a')).toEqual({ x: 1, y: 0 })
  })

  it('drops everything on release, so a silent step hands the sticks back', () => {
    const intents = createIntents()
    intents.walk('a', 1, 0)
    intents.jump('a')
    intents.look('a', 1, 0)
    intents.fly('a', 1, 0, 0, 1)

    intents.release()

    expect(intents.walkOf('a')).toBeNull()
    expect(intents.jumped('a')).toBe(false)
    expect(intents.lookOf('a')).toBeNull()
    expect(intents.flyOf('a')).toBeNull()
  })
})

describe('an ask nobody reads, and an ask written twice', () => {
  it('names the body a controller never looked at, once', () => {
    const said: string[] = []
    const intents = createIntents(message => said.push(message))

    intents.drive('a-walker', 1, 0, false)
    intents.release()
    intents.drive('a-walker', 1, 0, false)
    intents.release()

    expect(said).toHaveLength(1)
    expect(said[0]).toContain('a-walker')
    expect(said[0]).toContain('drive')
  })

  it('says nothing about an ask a controller did read', () => {
    const said: string[] = []
    const intents = createIntents(message => said.push(message))

    intents.walk('a-walker', 1, 0)
    intents.walkOf('a-walker')
    intents.release()

    expect(said).toEqual([])
  })

  it('names a body two scripts write on one step, where the last one wins', () => {
    const said: string[] = []
    const intents = createIntents(message => said.push(message))

    intents.walk('a-walker', 1, 0)
    intents.walk('a-walker', -1, 0)
    intents.walkOf('a-walker')

    expect(intents.walkOf('a-walker')).toEqual({ x: -1, y: 0 })
    expect(said).toHaveLength(1)
    expect(said[0]).toContain('two scripts')
  })

  it('holds its tongue entirely when nobody is watching', () => {
    const intents = createIntents()

    intents.drive('nobody', 1, 0, false)

    expect(() => intents.release()).not.toThrow()
  })
})
