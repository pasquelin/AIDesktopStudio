import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { modelNodeFixture, rigStateFixture } from '@/engines/scene/scene-fixtures'
import type { RigState } from '@/engines/scene/rigState'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useModelFiles } from '@/stores/modelFiles'
import { RigSection } from './RigSection'

const DOCUMENT = 'doc-1'
const node = modelNodeFixture('a')

const show = (): void => {
  render(<RigSection documentId={DOCUMENT} node={node} />)
}

beforeEach(() => {
  useModelFiles.setState({ rigs: {} })
  useDocuments.setState({ documents: {}, activeId: null })
})

const measured = (rig: Partial<RigState> = {}): void => {
  useModelFiles.getState().reportRig(DOCUMENT, node.id, { ...rigStateFixture([]), ...rig })
}

describe('RigSection', () => {
  it('says nothing at all while the file has not landed, having nothing to say about it yet', () => {
    show()

    expect(screen.queryByText('Squelette')).not.toBeInTheDocument()
  })

  it('tells a bare mesh it is not animatable yet, and offers to make it one', () => {
    measured({ status: 'staticMesh' })
    show()

    expect(screen.getByText(/pas encore animable/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rendre animable' })).toBeInTheDocument()
  })

  it('tells a character it is ready, and offers to change its skeleton', () => {
    measured({ status: 'riggedCharacter' })
    show()

    expect(screen.getByText(/prêt à être animé/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Modifier le squelette/ })).toBeInTheDocument()
  })

  it('says what stands in the way of fitting one at all', () => {
    measured({
      status: 'staticMesh',
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 1 } },
    })
    show()

    expect(screen.getByText(/trop plat/)).toBeInTheDocument()
  })

  // 🛑 The whole point of the section now: a skeleton belongs to a FILE, and the tab that opens
  // on one is where it is edited — never here, over a node that only references it.
  it('opens a character tab on the model’s own file', async () => {
    installFakeBridge()
    measured({ status: 'riggedCharacter' })
    show()

    await userEvent.click(screen.getByRole('button', { name: /Modifier le squelette/ }))

    const opened = Object.values(useDocuments.getState().documents)
    expect(opened.map(one => [one.kind, one.sourceAssetId])).toEqual([
      ['character', node.model.assetId],
    ])
  })
})
