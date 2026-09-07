import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { HumanoidRole } from '@shared/domain/humanoid'
import type { ClipSource } from '@shared/domain/scene'
import { useModelFiles } from '@/stores/modelFiles'
import { CharacterMotionPickerMapping } from './CharacterMotionPickerMapping'

const DOCUMENT = 'doc-1'
const SOURCE: ClipSource = { kind: 'bundled', name: 'Capoeira' }

function show(missingInTarget: HumanoidRole[] = [], missingInSource: HumanoidRole[] = []): void {
  useModelFiles.setState({
    fits: {
      [DOCUMENT]: { a: { 'bundled:Capoeira': { matched: [], missingInSource, missingInTarget } } },
    },
  })
  render(<CharacterMotionPickerMapping documentId={DOCUMENT} nodeId="a" source={SOURCE} />)
}

describe('what the preview says about the fit', () => {
  beforeEach(() => {
    useModelFiles.setState({ fits: {} })
  })

  it('says nothing of hands a character simply does not have', () => {
    show(['LeftThumb1', 'LeftIndex1', 'RightLittle3'])

    expect(screen.getByText(/sait jouer/)).toBeInTheDocument()
    expect(screen.queryByText(/pas parfaitement/)).not.toBeInTheDocument()
  })

  it('warns as soon as a joint of the body itself is out', () => {
    show(['LeftThumb1'], ['LeftFoot'])

    expect(screen.getByText(/pas parfaitement/)).toBeInTheDocument()
  })

  // Behind a click, and never a wall of bone names on arrival — what the issue asks in as many
  // words. Fingers stay out of it: thirty rows nobody can act on is the noise being removed.
  it('lists the joints of the body once the reader asks, and them alone', async () => {
    show(['LeftThumb1'], ['LeftFoot'])

    await userEvent.click(screen.getByRole('button', { name: /articulations/ }))

    expect(screen.getByText('LeftFoot')).toBeInTheDocument()
    expect(screen.queryByText('LeftThumb1')).not.toBeInTheDocument()
  })
})
