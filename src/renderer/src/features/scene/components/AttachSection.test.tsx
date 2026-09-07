import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { useModelFiles } from '@/stores/modelFiles'
import { AttachSection } from './AttachSection'

const DOCUMENT = 'doc-1'
const SOCKETS = [{ id: 'hand', name: 'Main droite', bone: 'RightHand', rest: IDENTITY_TRANSFORM }]

function show(attached?: string) {
  const run = vi.fn()
  const node = {
    ...meshNode('sword'),
    parentId: 'hero',
    ...(attached && { attach: { socket: attached } }),
  }
  render(<AttachSection node={node} documentId={DOCUMENT} edit={{ run, gesture: {} } as never} />)

  return run
}

beforeEach(() => {
  useModelFiles.setState({ sockets: { [DOCUMENT]: { hero: SOCKETS } } })
})

describe('where a node hangs on the character above it', () => {
  it('offers the attachment points that character carries, by their own names', async () => {
    const run = show()

    await userEvent.selectOptions(screen.getByLabelText('Point d’attache'), 'hand')

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('reads back the point it is already hung on', () => {
    show('hand')

    expect(screen.getByLabelText('Point d’attache')).toHaveValue('hand')
  })

  // A select offering nothing is a promise the file cannot keep: most parents are not characters.
  it('says nothing at all where the parent carries no attachment point', () => {
    useModelFiles.setState({ sockets: {} })
    show()

    expect(screen.queryByText('Attache')).not.toBeInTheDocument()
  })
})
