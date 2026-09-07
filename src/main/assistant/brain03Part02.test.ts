import { describe, expect, it } from 'vitest'

import { BRIEFING_ROOM, UTTERANCE_ROOM } from './brainProvider'

import { INSTRUCTION_FALLBACK } from './providerLimits'

import { instructionFor, recentHistory } from './instruction'

describe('what the model is told', () => {
  /**
   * 🛑 The three above only hold while the CUT happens to stop short: a briefing filling its room
   * to the last character left the sentence 20 short, the preamble that joins them being paid out
   * of it — measured 2026-09-02, at 1 497 of the 1 500 promised.
   */
  it('leaves that room to a briefing that fills its own to the last character', () => {
    const sent = instructionFor('b'.repeat(BRIEFING_ROOM), 'y'.repeat(3_000), INSTRUCTION_FALLBACK)

    expect(sent).toContain('y'.repeat(UTTERANCE_ROOM))
    // And the room is filled to the character: a budget that stopped short would pass the line
    // above while still handing the model less than it promised.
    expect(sent.length).toBe(INSTRUCTION_FALLBACK)
  })

  it('keeps the last turns, not the first', () => {
    expect(recentHistory(['a', 'b', 'c', 'd'], 2)).toEqual(['c', 'd'])
  })
})
