import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { modelNodeFixture, rigStateFixture } from '@/engines/scene/scene-fixtures'
import type { RigState } from '@/engines/scene/rigState'
import { useModelFiles } from '@/stores/modelFiles'
import { MotionsSection } from './MotionsSection'

const DOCUMENT = 'doc-1'
const node = modelNodeFixture('a')

const show = (): void => {
  render(<MotionsSection documentId={DOCUMENT} node={node} />)
}

const measured = (rig: Partial<RigState> = {}): void => {
  useModelFiles.getState().reportRig(DOCUMENT, node.id, { ...rigStateFixture([]), ...rig })
}

beforeEach(() => {
  useModelFiles.setState({ rigs: {} })
})

describe('MotionsSection', () => {
  it('says nothing at all while the file has not landed', () => {
    show()

    expect(screen.queryByText('Mouvements')).not.toBeInTheDocument()
  })

  /**
   * 🛑 A motion drives JOINTS. On a bare mesh the picker laid a real block onto a skeleton that
   * does not exist — `retargetPlanOf` pairs no bone — so it played, the head ran, and the model
   * stood still with nothing saying why. Moving the object itself stays a matter of transform
   * keys, which every node carries.
   */
  it('offers none on a bare mesh, which has no joint to drive', () => {
    measured({ status: 'staticMesh' })
    show()

    expect(screen.queryByText('Mouvements')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter un mouvement' })).not.toBeInTheDocument()
  })

  it('offers them as soon as the file carries bones, named or humanoid or not', () => {
    measured({ status: 'skinnedMesh' })
    show()

    expect(screen.getByText('Mouvements')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter un mouvement' })).toBeInTheDocument()
  })
})
