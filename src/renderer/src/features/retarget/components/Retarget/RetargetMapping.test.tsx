import { fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { expect, it } from 'vitest'
import { isSkeletonProfile, type SkeletonProfile } from '@shared/domain/skeletonProfile'
import { RetargetMapping } from './RetargetMapping'
import { motionView } from '../../retarget-fixtures'
import { motionProfile } from '../../retargetDraft'

it('keeps cleared roles locked during automatic matching and never assigns one bone twice', async () => {
  const view = await motionView()
  let latest: SkeletonProfile = motionProfile(view.bones)
  function Mapping() {
    const [profile, setProfile] = useState(latest)
    return (
      <RetargetMapping
        source={{
          view,
          profile,
          onChange: next => {
            latest = next
            setProfile(next)
          },
        }}
        target={{ view, profile: motionProfile(view.bones), onChange: () => {} }}
      />
    )
  }
  const { container, getByRole, unmount } = render(<Mapping />)
  expect(getByRole('button', { name: 'Bras (8)' })).toHaveAttribute('aria-expanded', 'false')
  expect(container.querySelectorAll('select')).toHaveLength(12)
  fireEvent.change(getByRole('searchbox'), { target: { value: 'Main' } })
  expect(getByRole('button', { name: 'Bras (2)' })).toHaveAttribute('aria-expanded', 'true')
  expect(container.querySelectorAll('select')).toHaveLength(4)
  fireEvent.change(getByRole('searchbox'), { target: { value: '' } })
  const field = (role: string) => {
    const found = container.querySelector(`[data-sc="field:retarget.source.${role}"]`)
    if (!found) throw new Error(`missing role ${role}`)
    return found
  }
  fireEvent.change(field('Hips'), { target: { value: '' } })
  fireEvent.click(getByRole('button', { name: 'Auto' }))
  expect(latest.roles.Hips).toBeUndefined()
  expect(latest.ignored).toContain('Hips')
  fireEvent.change(field('Hips'), { target: { value: 'Spine' } })
  expect(latest.roles.Spine).toBe('Hips')
  expect(Object.values(latest.roles)).not.toContain('Spine')
  expect(isSkeletonProfile(latest)).toBe(true)
  unmount()
  view.engine.dispose()
})
