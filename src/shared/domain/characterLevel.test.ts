import { describe, expect, it } from 'vitest'

import { CHARACTER_LEVELS, nearestCharacterLevel, type CharacterLevel } from './characterLevel'

describe('the level a character is placed at', () => {
  it('answers the one asked for when the character has it', () => {
    expect(nearestCharacterLevel('high', CHARACTER_LEVELS)).toBe('high')
  })

  /**
   * The case the shipped four exist FOR, seen from the other side: somebody imports one file, and
   * every ask has to land on it rather than leaving the scene without a character.
   */
  it('answers the only level a character has, whatever was asked', () => {
    const only: readonly CharacterLevel[] = ['low']

    for (const wanted of CHARACTER_LEVELS) {
      expect(nearestCharacterLevel(wanted, only)).toBe('low')
    }
  })

  it('reaches for the closest one it has, above or below', () => {
    expect(nearestCharacterLevel('ultra', ['low', 'medium'])).toBe('medium')
    expect(nearestCharacterLevel('low', ['high', 'ultra'])).toBe('high')
  })

  // Two levels equally far are not equally cheap, and the frame budget is what breaks.
  it('takes the lighter of two equally distant levels', () => {
    expect(nearestCharacterLevel('high', ['medium', 'ultra'])).toBe('medium')
  })

  it('answers nothing only when the character has nothing', () => {
    expect(nearestCharacterLevel('medium', [])).toBeNull()
  })
})
