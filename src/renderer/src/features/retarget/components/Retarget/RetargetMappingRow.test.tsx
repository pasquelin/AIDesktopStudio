import { fireEvent, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type * as Select from '@/components/SelectField'
import { RetargetMapping } from './RetargetMapping'
import { motionView } from '../../retarget-fixtures'
import { motionProfile } from '../../retargetDraft'

const { drawn } = vi.hoisted(() => ({ drawn: vi.fn() }))

// The real field, counted: what this file is about is HOW MANY of them redraw, not what they show.
vi.mock('@/components/SelectField', async importOriginal => {
  const held = await importOriginal<typeof Select>()
  return {
    ...held,
    SelectField: (props: Select.SelectFieldProps<string>) => {
      drawn(props.scId)
      return held.SelectField(props)
    },
  }
})

/**
 * 🛑 A humanoid has fifty-two roles and a rig some seventy bones, so this section rebuilt around
 * 7 400 `<option>` on every render — including on each letter typed into a field three components
 * away, the workspace passing its props whole.
 */
it('redraws no mapping field when the search is narrowed within what it already showed', async () => {
  const view = await motionView()
  const profile = motionProfile(view.bones)
  const side = { view, profile, onChange: () => {} }
  const { getByRole, unmount } = render(<RetargetMapping source={side} target={side} />)

  fireEvent.change(getByRole('searchbox'), { target: { value: 'Main' } })
  drawn.mockClear()
  fireEvent.change(getByRole('searchbox'), { target: { value: 'Main g' } })

  expect(drawn).not.toHaveBeenCalled()
  unmount()
  view.engine.dispose()
})
