import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DocumentDescriptor } from '@shared/domain/document'
import { addNode } from '@/engines/scene/commands'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { useDocuments } from '@/stores/documents'
import { clearScenes } from '@/stores/scene-fixtures'
import { useScenes } from '@/stores/scenes'
import { Scene } from './Scene'
import { installCharacterDocument } from '@/stores/character-fixtures'
import { workshopIdOf } from '@shared/domain/character'
import { workshopScene } from '@/character/characterStage'

const scene: DocumentDescriptor = {
  id: 'doc-1',
  kind: 'scene',
  title: 'Niveau',
  workspace: '3d',
  path: 'documents/Niveau.gltf',
}
const image: DocumentDescriptor = {
  id: 'doc-2',
  kind: 'image',
  title: 'Affiche',
  workspace: 'image',
  path: 'documents/Affiche.ora',
}

beforeEach(() => {
  clearScenes()
  useDocuments.setState({ documents: {}, stored: [], activeId: null })
})

describe('the scene panel', () => {
  it('says so rather than showing an empty tree when no scene is in front', () => {
    render(<Scene />)
    expect(screen.getByText(/Ouvrez une scène/)).toBeInTheDocument()
  })

  it('draws the tree of the scene in front', () => {
    useDocuments.setState({ documents: { 'doc-1': scene }, activeId: 'doc-1' })
    useScenes.getState().runCommand('doc-1', addNode(meshNode('box-1')))

    render(<Scene />)
    expect(screen.getByRole('tree')).toBeInTheDocument()
  })

  it('draws the model workshop as a scene while a character is in front', () => {
    installCharacterDocument('character-1', 'asset-hero')
    const workshopId = workshopIdOf('asset-hero')
    useScenes.getState().replace(workshopId, workshopScene('asset-hero'))

    render(<Scene />)

    expect(screen.getByRole('tree')).toBeInTheDocument()
    expect(screen.getByText('asset-hero')).toBeInTheDocument()
  })

  // A tree panel handed an image document would ask `useScenes` for a scene that does not exist.
  it('ignores a document of another kind in front', () => {
    useDocuments.setState({ documents: { 'doc-2': image }, activeId: 'doc-2' })

    render(<Scene />)
    expect(screen.getByText(/Ouvrez une scène/)).toBeInTheDocument()
  })
})
