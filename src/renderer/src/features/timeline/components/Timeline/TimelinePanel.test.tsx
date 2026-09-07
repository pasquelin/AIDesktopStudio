import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { installCanvas } from '@/stores/canvas-fixtures'
import { useDocuments } from '@/stores/documents'
import { createDefaultScene } from '@/engines/scene/defaultScene'
import { modelNodeFixture } from '@/engines/scene/scene-fixtures'
import { workshopIdOf } from '@shared/domain/character'
import { installCharacterDocument } from '@/stores/character-fixtures'
import { useScenes } from '@/stores/scenes'
import { installSequence } from '@/stores/sequence-fixtures'
import { TimelinePanel } from './TimelinePanel'

describe('TimelinePanel', () => {
  beforeEach(() => {
    useDocuments.setState({ documents: {}, activeId: null })
  })

  it('says so rather than showing an empty strip when no sequence is open', () => {
    render(<TimelinePanel />)
    expect(screen.getByText(/Aucune séquence ouverte/)).toBeInTheDocument()
  })

  it('paints the timeline of the document in front', () => {
    installSequence('doc-1')
    const view = render(<TimelinePanel />)
    expect(view.container.querySelector('canvas')).toBeInTheDocument()
  })

  // The band a character is posed along: the same one a scene animates a node with, on the
  // workshop the tab lays the model on — and the dock is where it lives now.
  it('paints the band of the workshop when a character is in front', () => {
    // The workshop the tab lays the model on, filled as the engine fills it: one node, on the
    // sheet. Written into the scene store under the character's own document id.
    useScenes.getState().replace(workshopIdOf('asset-hero'), {
      ...createDefaultScene(),
      nodes: [modelNodeFixture('asset-hero')],
      animation: { ...createDefaultScene().animation, sheet: [modelNodeFixture('asset-hero').id] },
    })
    installCharacterDocument('doc-1', 'asset-hero')
    render(<TimelinePanel />)

    expect(screen.getByText(modelNodeFixture('asset-hero').name)).toBeInTheDocument()
  })

  // Another kind handed to `useSequences` would give it a montage drawn from the default state.
  it('shows no strip for a document that is not a sequence', () => {
    installCanvas('doc-1')
    render(<TimelinePanel />)

    expect(screen.getByText(/Aucune séquence ouverte/)).toBeInTheDocument()
  })
})
