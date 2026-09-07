import { describe, expect, it } from 'vitest'
import { isRetargetRoute, retargetSessionOf, retargetRoute } from './retargetWindow'

describe('retarget window routes', () => {
  it('round trips a session and does not accept another window', () => {
    expect(retargetSessionOf(`#${retargetRoute('session-1')}`)).toBe('session-1')
    expect(isRetargetRoute('#settings')).toBe(false)
    expect(retargetSessionOf('#settings')).toBeNull()
  })
})
