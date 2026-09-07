import { describe, expect, it } from 'vitest'
import { lendable } from './lendable'

describe('a lent value', () => {
  it('stands in until its undo, which puts the previous one back', () => {
    const value = lendable('own')
    const giveBack = value.lend('lent')

    expect(value.current()).toBe('lent')
    giveBack()
    expect(value.current()).toBe('own')
  })
})
