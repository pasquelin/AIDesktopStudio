import { describe, expect, it } from 'vitest'
import { actionIntents, actionReads } from './actionCapabilities'
import { ACTION_INTENTS } from './actionIntents'

describe('actionIntents', () => {
  it('answers what the table says, whatever the verb of the name suggests', () => {
    expect(actionIntents({ name: 'scene.state' })).toEqual(['read'])
    expect(actionIntents({ name: 'node.remove' })).toEqual(['delete'])
    // `diff` and `attach` open no verb the old guess knew; both were declared by hand.
    expect(actionIntents({ name: 'git.diff' })).toEqual(['read'])
    expect(actionIntents({ name: 'component.attach' })).toEqual(['create'])
  })

  // 🛑 The defect this table closes: 81 names said nothing to the verb guess, `actionIntents`
  // answered `[]`, and the mission runtime verified after each one instead of planning.
  it('leaves no action without an intent', () => {
    expect(Object.entries(ACTION_INTENTS).filter(([, intents]) => intents.length === 0)).toEqual([])
  })
})

describe('actionReads', () => {
  it('holds for reads and searches only', () => {
    expect(actionReads({ name: 'files.search' })).toBe(true)
    expect(actionReads({ name: 'memory.recall' })).toBe(true)
    expect(actionReads({ name: 'files.canUndoRedo' })).toBe(true)
    expect(actionReads({ name: 'key.writePoseKeys' })).toBe(false)
    expect(actionReads({ name: 'git.push' })).toBe(false)
  })
})
