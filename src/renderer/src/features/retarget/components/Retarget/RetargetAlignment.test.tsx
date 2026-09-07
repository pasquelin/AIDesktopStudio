import { fireEvent, render } from '@testing-library/react'
import { Euler, Quaternion } from 'three'
import { expect, it } from 'vitest'
import { RetargetAlignment } from './RetargetAlignment'
import type { WireBone } from '@/engines/scene/retargetMessage'

it('shows the rest rotation in whole degrees rather than the float noise of a quaternion', () => {
  const turn = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0))
  const bone: WireBone = {
    name: 'Hips',
    parent: -1,
    position: [0, 0, 0],
    quaternion: [turn.x + 1e-9, turn.y, turn.z, turn.w],
    scale: [1, 1, 1],
  }
  const { container, getByRole, unmount } = render(
    <RetargetAlignment
      side="target"
      bones={[bone]}
      profile={{ signature: 'v2-1-x', roles: {} }}
      onChange={() => {}}
    />,
  )
  fireEvent.click(getByRole('button', { name: /Pose de référence personnage/i }))
  const field = container.querySelector<HTMLInputElement>(
    '[data-sc="field:retarget.target.alignmentTurn.x"] input, input[data-sc="field:retarget.target.alignmentTurn.x"]',
  )
  expect(field?.value).toBe('-90')
  unmount()
})
