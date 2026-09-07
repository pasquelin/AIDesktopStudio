import { describe, expect, it } from 'vitest'

import { studioBriefing } from './instruction'

import type { AssistantNote } from '@shared/domain/assistantNote'

import { answeredTurn } from './brainTurn'

describe('what a turn writes down', () => {
  /**
   * 🛑 The WHOLE briefing travels on the note: it is what the transcript file exists to keep, and
   * clipping it here would leave the one place it survives holding a head.
   */
  it('carries the whole briefing, not a head of it', async () => {
    const notes: AssistantNote[] = []
    // Past the whole registry, so the briefing is the 90 000-character one.
    const briefing = studioBriefing({ room: 200_000 })

    await answeredTurn(
      briefing,
      () => Promise.resolve({ answer: '{"say":"ok","calls":[]}', cost: 0 }),
      undefined,
      { door: 'deepseek', model: 'deepseek-chat', note: one => notes.push(one) },
    )

    expect(notes.find(one => one.kind === 'sent')?.text).toBe(briefing.text)
  })
})
