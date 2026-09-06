import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { canUndo } from '@/engines/core/history'
import { addClip } from '@/engines/timeline/commands'
import { clipFixture } from '@/engines/timeline/timeline-fixtures'
import { DEFAULT_VIDEO_TOOL } from '@/features/video/components/videoTools'
import { installCharacterDocument } from '@/stores/character-fixtures'
import { useDocuments } from '@/stores/documents'
import { installSequence } from '@/stores/sequence-fixtures'
import { sequenceHistoryOf, sequenceOf, useSequences } from '@/stores/sequences'
import { useVideoTool } from '@/stores/videoTool'
import { TimelineActions } from './TimelineActions'

const clip = clipFixture('clip-1', 0, 1_000_000, { assetId: 'asset-1' })

describe('TimelineActions', () => {
  beforeEach(() => {
    useVideoTool.setState({ tool: DEFAULT_VIDEO_TOOL })
    useDocuments.setState({ documents: {}, activeId: null })
  })

  it('renders no action while no document is active', () => {
    const view = render(<TimelineActions />)
    expect(view.container).toBeEmptyDOMElement()
  })

  it('offers the montage tools in the panel title bar', () => {
    installSequence('doc-1')
    render(<TimelineActions />)

    expect(screen.getByRole('button', { name: /Sélection/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lame/ })).toBeInTheDocument()
  })

  // The three bands open on the same row. The montage had none: its transport lived under the
  // programme monitor alone, so the same panel said the time in Audio and in 3D and not here.
  it('opens the montage bar on the transport the other two bands carry', () => {
    installSequence('doc-1')
    render(<TimelineActions />)

    expect(screen.getByRole('button', { name: /Retour au début/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Lire/ })).toBeInTheDocument()
    expect(screen.getByText('00:00:00:00')).toBeInTheDocument()
  })

  it('arms the tool the bar picks', async () => {
    installSequence('doc-1')
    render(<TimelineActions />)

    await userEvent.click(screen.getByRole('button', { name: /Lame/ }))

    expect(useVideoTool.getState().tool).toBe('blade')
  })

  // Moved here from the foot of the header column, where a montage was started from a corner
  // hidden behind whatever the strip was scrolled to.
  it('adds a track of each kind from the bar', async () => {
    installSequence('doc-1')
    render(<TimelineActions />)

    await userEvent.click(screen.getByRole('button', { name: /Ajouter une piste vidéo/ }))
    await userEvent.click(screen.getByRole('button', { name: /Ajouter une piste audio/ }))

    const ids = sequenceOf(useSequences.getState(), 'doc-1').tracks.map(track => track.id)
    expect(ids).toEqual(['V1', 'A1', 'V2', 'A2'])
  })

  it('arms nothing by adding a track — the two are not tools', async () => {
    installSequence('doc-1')
    render(<TimelineActions />)

    await userEvent.click(screen.getByRole('button', { name: /Ajouter une piste audio/ }))

    expect(useVideoTool.getState().tool).toBe(DEFAULT_VIDEO_TOOL)
    expect(canUndo(sequenceHistoryOf(useSequences.getState(), 'doc-1'))).toBe(true)
  })

  // The panel tested `activeSceneId` alone, so a model tab in front had a band with no bar at all.
  it('offers the band tools to a model tab, without the film button its workshop cannot use', () => {
    installCharacterDocument('doc-hero', 'asset-hero')
    render(<TimelineActions />)

    expect(screen.getByRole('button', { name: /Retour au début/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rendre en vidéo/ })).not.toBeInTheDocument()
  })

  // The Edit menu carries `sequence.undo`; a second pair on the title bar said otherwise.
  it('draws no history of its own', () => {
    installSequence('doc-1')
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))

    render(<TimelineActions />)

    expect(screen.queryByRole('button', { name: /Annuler/ })).not.toBeInTheDocument()
  })
})
