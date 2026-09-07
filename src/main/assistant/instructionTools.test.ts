import { describe, expect, it } from 'vitest'
import { studioBriefing } from './instruction'

describe('a briefing whose manuals travel as native tools', () => {
  it('tells the model to call them, and never to write a name', () => {
    const text = studioBriefing({ room: 200_000, tools: true }).text

    expect(text).toContain('CALLING THE TOOLS')
    expect(text).toContain('Never write an action name')
    expect(text).toContain('Calling no tool means the request is DONE, and "say" then tells')
    expect(text).toContain('"ask": {"question"')
    expect(text).not.toContain('"calls": a list of actions')
  })
})
