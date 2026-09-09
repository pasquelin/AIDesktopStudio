import { describe, expect, it } from 'vitest'
import { scopeForRole, writeScopeFor } from './aiOverview'
import type { RoleRow } from './aiOverview'
import { roleRow } from './aiOverview-fixtures'
import { ASSISTANT_ROLE, DICTATION_ROLE } from './aiRole'

const chosen = (project: RoleRow['chosen']['project']): Pick<RoleRow, 'chosen'> => ({
  chosen: { app: null, project },
})

describe('writeScopeFor', () => {
  /**
   * A choice written to the application while the open project overrides the role agrees with
   * itself and moves nothing on screen — which is what a click from the assistant modal did.
   */
  it('writes where the choice in force was written', () => {
    expect(writeScopeFor(chosen(null), null)).toBe('app')
    expect(writeScopeFor(chosen(null), '/projects/one')).toBe('app')
    expect(writeScopeFor(chosen({ kind: 'cloud', providerId: 'deepseek' }), '/projects/one')).toBe(
      'project',
    )
  })

  // The panels reach it through the whole overview: the employment is only known at the click.
  it('answers for a role the overview does not carry', () => {
    const row = roleRow({
      role: DICTATION_ROLE,
      chosen: { app: null, project: { kind: 'cloud', providerId: 'deepseek' } },
    })

    expect(scopeForRole([row], DICTATION_ROLE, '/projects/one')).toBe('project')
    expect(scopeForRole([row], ASSISTANT_ROLE, '/projects/one')).toBe('app')
  })
})
