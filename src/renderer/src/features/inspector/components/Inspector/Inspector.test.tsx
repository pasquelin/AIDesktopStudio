import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { DEFAULT_CANVAS } from '@/engines/canvas/canvasState'
import { layerFixture } from '@/engines/canvas/canvas-fixtures'
import { installCanvas } from '@/stores/canvas-fixtures'
import { addClip } from '@/engines/timeline/commands'
import { clipFixture, sequenceWith, trackFixture } from '@/engines/timeline/timeline-fixtures'
import { useAssets } from '@/stores/assets'
import { installDocument } from '@/stores/document-fixtures'
import { useDocuments } from '@/stores/documents'
import { useJobs } from '@/stores/jobs'
import { installSequence } from '@/stores/sequence-fixtures'
import { selectTrackIn, sequenceOf, useSequences } from '@/stores/sequences'
import { useLayouts } from '@/stores/layouts'
import { useSelection } from '@/stores/selection'
import { withQueries } from '@/features/shell/components/query-fixtures'
import { clearCharacters, installCharacterDocument } from '@/stores/character-fixtures'
import { seedCharacter } from '@/stores/character'
import { modelNodeFixture, rigStateFixture } from '@/engines/scene/scene-fixtures'
import { useModelFiles } from '@/stores/modelFiles'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { installScene } from '@/stores/scene-fixtures'
import { Inspector } from './Inspector'

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'asset-1',
  name: 'pad.wav',
  type: 'audio',
  location: 'local',
  tags: [],
  createdAt: '2026-08-07T10:00:00.000Z',
  ...overrides,
})

function openSequence(): void {
  installSequence('doc-1', sequenceWith([trackFixture('V1', 'video'), trackFixture('A1', 'audio')]))
}

describe('Inspector, on the document in front', () => {
  beforeEach(() => {
    useLayouts.setState({ activeWorkspace: 'image', home: false })
    useSelection.getState().selectFiles([])
    useAssets.setState({ items: [asset()] })
    useJobs.setState({ jobs: [], bodies: {} })
    useDocuments.setState({ documents: {}, activeId: null })
    useModelFiles.setState({ rigs: {} })
  })

  // The tab rigs a model of the library, and its skeleton is what the studio's one inspector
  // reads while it is in front — nothing of a scene, which is why it has a tab of its own.
  it('reads the skeleton of the character in front', () => {
    installCharacterDocument('doc-1', 'asset-hero')
    seedCharacter('asset-hero', null, {})
    render(withQueries(<Inspector />))

    expect(screen.getByText('Squelette')).toBeInTheDocument()
    expect(screen.getByText(/pas encore animable/)).toBeInTheDocument()
  })

  it('lists the motions of a character selected in a scene', () => {
    clearCharacters()
    installDocument('doc-1', '3d')
    installScene('doc-1', {
      ...EMPTY_SCENE,
      nodes: [modelNodeFixture('Character', 'asset-hero')],
      selectedIds: ['Character'],
    })
    // The FILE has bones, which is what a scene reads: a motion is offered where it has joints
    // to drive, and a bare mesh is sent to `RigSection` instead.
    useModelFiles.getState().reportRig('doc-1', 'Character', rigStateFixture(['Hips', 'Spine']))
    seedCharacter('asset-hero', null, {
      motions: [{ id: 'motion-1', name: 'Walk', assetId: 'asset-walk' }],
    })
    render(withQueries(<Inspector />))

    expect(screen.getByText('Mouvements')).toBeInTheDocument()
    expect(screen.getByText('Walk')).toBeInTheDocument()
  })

  it('asks for a selection when there is none', () => {
    render(<Inspector />)
    expect(screen.getByText(/Sélectionnez un élément/)).toBeInTheDocument()
  })

  /**
   * The stack highlights `activeLayerId`, and a layer born on the canvas — a caption, a shape —
   * arms it without posting a selection: reading the selection alone left the panel empty over
   * the very layer the stack showed picked.
   */
  it('reads the armed layer of the image in front, selection or not', () => {
    installCanvas('image-1', {
      ...DEFAULT_CANVAS,
      layers: [layerFixture({ name: 'Paint' })],
      activeLayerId: 'layer-2',
    })

    render(<Inspector />)

    expect(screen.getByText('Paint')).toBeInTheDocument()
    expect(screen.queryByText(/Sélectionnez un élément/)).not.toBeInTheDocument()
  })

  /**
   * A sky has no node to pick: everything on it belongs to the document, so the face shows
   * without a selection. It had a panel of its own until 2026-08-19 — which put a box full of the
   * document's properties directly above an inspector reading « select something ».
   */
  it('grades the sky in front without waiting for anything to be selected', () => {
    installDocument('sky-1', 'skyboxes')

    render(<Inspector />)

    expect(screen.getByLabelText('Élévation')).toBeInTheDocument()
    expect(screen.queryByText(/Sélectionnez un élément/)).not.toBeInTheDocument()
  })

  /**
   * 🛑 The document in front keeps the panel, whatever a side panel has picked. An asset used to
   * answer here FIRST and unguarded, so clicking a thumbnail took the inspector away from the
   * image being edited — with nothing on screen saying why the layers had stopped being
   * described. What an asset is now reads out under the shelf itself, in `AssetDetails`.
   */
  it('leaves the image in front described while a file is picked in the explorer', () => {
    installCanvas('image-1', {
      ...DEFAULT_CANVAS,
      layers: [layerFixture({ name: 'Paint' })],
      activeLayerId: 'layer-2',
    })
    useSelection.getState().selectFiles(['Images/etude.png'])

    render(<Inspector />)

    expect(screen.getByText('Paint')).toBeInTheDocument()
    expect(screen.queryByText('pad.wav')).not.toBeInTheDocument()
  })

  it('reads out the clip the montage has selected', () => {
    openSequence()
    useSequences
      .getState()
      .runCommand(
        'doc-1',
        addClip('A1', clipFixture('clip-1', 0, 2_000_000, { assetId: 'asset-1' })),
      )
    render(<Inspector />)

    expect(screen.getByText('pad.wav')).toBeInTheDocument()
    expect(screen.getByLabelText('Fondu d’entrée')).toBeInTheDocument()
  })

  it('offers a gain on a sound clip and none on a picture clip', () => {
    openSequence()
    useSequences
      .getState()
      .runCommand(
        'doc-1',
        addClip('V1', clipFixture('clip-1', 0, 2_000_000, { assetId: 'asset-1' })),
      )
    render(<Inspector />)

    expect(screen.queryByLabelText('Gain')).not.toBeInTheDocument()
  })

  it('writes a fade back as an undoable command', async () => {
    openSequence()
    useSequences
      .getState()
      .runCommand(
        'doc-1',
        addClip('A1', clipFixture('clip-1', 0, 2_000_000, { assetId: 'asset-1' })),
      )
    render(<Inspector />)

    const field = screen.getByLabelText('Fondu d’entrée')
    await userEvent.clear(field)
    await userEvent.type(field, '0.5{Enter}')

    expect(sequenceOf(useSequences.getState(), 'doc-1').tracks[1]?.clips[0]?.fadeIn).toBe(500_000)
  })

  it('reads out the track that was selected', () => {
    openSequence()
    selectTrackIn('doc-1', 'A1')
    render(<Inspector />)

    expect(screen.getByText('A1')).toBeInTheDocument()
    // The same control as the header column, so the same accessible name.
    expect(screen.getByRole('button', { name: /Rendre muette la piste A1/ })).toBeInTheDocument()
  })

  it('falls back to the empty state when the selected track is gone', () => {
    openSequence()
    selectTrackIn('doc-1', 'nope')
    render(<Inspector />)

    expect(screen.getByText(/Sélectionnez un élément/)).toBeInTheDocument()
  })

  it('says nothing rather than describing the track of the same name in another sequence', () => {
    openSequence()
    // Two montages, and every montage has a track called A1. The one that was clicked is in
    // the tab behind; describing the one in front would be silently the wrong track.
    useDocuments.setState({
      documents: {
        'doc-1': {
          id: 'doc-1',
          kind: 'sequence',
          title: 'Montage',
          workspace: 'video',
          path: 'documents/Montage.otio',
        },
        'doc-2': {
          id: 'doc-2',
          kind: 'sequence',
          title: 'Autre',
          workspace: 'video',
          path: 'documents/Autre.otio',
        },
      },
      activeId: 'doc-2',
    })
    useSequences.setState({
      states: {
        'doc-1': sequenceWith([trackFixture('A1', 'audio')]),
        'doc-2': sequenceWith([trackFixture('A1', 'audio', [], { name: 'Ambiance' })]),
      },
      histories: {},
    })
    selectTrackIn('doc-1', 'A1')

    render(<Inspector />)

    expect(screen.queryByText('Ambiance')).not.toBeInTheDocument()
    expect(screen.getByText(/Sélectionnez un élément/)).toBeInTheDocument()
  })
})
