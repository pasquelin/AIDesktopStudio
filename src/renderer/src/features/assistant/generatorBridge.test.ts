import type { GeneratorBridge } from './generatorBridge'
import { stillWaiting } from '@/helpers/waiting-fixtures'
import { panelsStore } from '@/stores/panels'
import * as revealPanel from '@/helpers/revealPanel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generatorMounted, registerGenerator } from './generatorBridge'

/** Nothing of the panel is exercised here: what is under test is WHEN it is handed over. */
const generator = {
  body: () => null,
  armed: () => null,
  submit: () => Promise.resolve(null),
  references: () => [],
} satisfies GeneratorBridge

const shown = vi.spyOn(revealPanel, 'toolIsShown')

beforeEach(() => {
  shown.mockReturnValue(true)
})

/**
 * 🛑 The panel declares itself on its own mount, a React render after the store write that
 * reveals it. `generator.prepare` answered before that render, and the very next call was
 * refused `generatorClosed` about a panel that was in fact opening.
 */
describe('waiting for the generation panel to be mounted', () => {
  it('hands over the panel already mounted without waiting', async () => {
    const drop = registerGenerator(generator)

    await expect(generatorMounted()).resolves.toBe(generator)
    drop()
  })

  it('holds until the panel declares itself', async () => {
    const waiting = generatorMounted()
    expect(await stillWaiting(waiting)).toBe(true)

    const drop = registerGenerator(generator)
    await expect(waiting).resolves.toBe(generator)
    drop()
  })

  // A surface that will never mount one is an answer, not a wait that ran out: the chassis
  // stopping to show the panel is what says so.
  it('lets go when the chassis stops showing the panel', async () => {
    const waiting = generatorMounted()
    expect(await stillWaiting(waiting)).toBe(true)

    shown.mockReturnValue(false)
    panelsStore.setState({})
    await expect(waiting).resolves.toBeNull()
  })

  it('answers at once when no panel is up to wait for', async () => {
    shown.mockReturnValue(false)

    await expect(generatorMounted()).resolves.toBeNull()
  })
})
