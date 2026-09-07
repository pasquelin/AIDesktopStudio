// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { InputMap } from './inputMap'
import { createInputContexts } from './inputContexts'

const map = (id: string, priority: number, defaultActive: boolean): InputMap => ({
  version: 1,
  id,
  priority,
  defaultActive,
  actions: [{ id: 'interact', kind: 'button', bindings: [{ device: 'keyboard', code: 'KeyE' }] }],
})

describe('input contexts', () => {
  it('starts default contexts and adds a vehicle context only once', () => {
    const contexts = createInputContexts([map('character', 0, true), map('vehicle', 10, false)])

    expect(contexts.active()).toEqual(['character'])
    contexts.push('vehicle')
    contexts.push('vehicle')

    expect(contexts.active()).toEqual(['character', 'vehicle'])
  })

  it('removes a context without changing the remaining stack', () => {
    const contexts = createInputContexts([map('character', 0, true), map('vehicle', 10, false)])
    contexts.push('vehicle')

    contexts.pop('vehicle')

    expect(contexts.active()).toEqual(['character'])
  })

  /** What the selection cache of `inputActions` rests on: read once a step, it must not allocate. */
  it('hands the same list back until a push or a pop replaces it', () => {
    const contexts = createInputContexts([map('character', 0, true), map('vehicle', 10, false)])
    const first = contexts.active()

    expect(contexts.active()).toBe(first)
    contexts.push('vehicle')

    expect(contexts.active()).not.toBe(first)
    expect(first).toEqual(['character'])
  })
})

describe('a context no control map declares', () => {
  it('is named once, rather than a push doing nothing and saying nothing', () => {
    const said: string[] = []
    const contexts = createInputContexts([map('character', 0, true)], message => said.push(message))

    contexts.push('menu')
    contexts.push('menu')

    expect(contexts.active()).toEqual(['character'])
    expect(said).toHaveLength(1)
    expect(said[0]).toContain('menu')
  })

  it('says nothing at all when the context is declared', () => {
    const said: string[] = []
    const contexts = createInputContexts(
      [map('character', 0, true), map('menu', 100, false)],
      message => said.push(message),
    )

    contexts.push('menu')

    expect(contexts.active()).toEqual(['character', 'menu'])
    expect(said).toEqual([])
  })
})
