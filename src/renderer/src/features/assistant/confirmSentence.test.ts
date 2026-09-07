import { describe, expect, it } from 'vitest'
import { confirmSentence } from './confirmSentence'

const key = (name: string): string => name

describe('what a call is said to engage', () => {
  // A local model came back « the studio could not estimate how much » — a spend promised on a
  // model that spends nothing (Codex by MCP, 2026-09-06).
  it('says a run priced at nothing spends nothing, rather than that it could not be priced', () => {
    expect(confirmSentence('credits', 0, key, 'en')).toBe('assistant.confirm.noCost')
  })

  it('admits a price it does not have', () => {
    expect(confirmSentence('credits', null, key, 'en')).toBe('assistant.confirm.unknownCost')
  })
})
