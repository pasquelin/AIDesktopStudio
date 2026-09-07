import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type * as Bridge from '@/services/bridge'
import { startAssetDrag } from '@/helpers/assetDrag'
import { dragTransfer } from '@/helpers/drag-fixtures'
import { SECOND } from '@shared/domain/time'
import { addClip } from '@/engines/timeline/commands'
import { makeClip, EMPTY_SOUND_SEQUENCE } from '@/engines/timeline/timelineState'
import { useAssets } from '@/stores/assets'
import { sequenceOf, useSequences } from '@/stores/sequences'
import { useDocuments } from '@/stores/documents'
import { useMonitorPair } from '@/stores/monitorPair'
import { AudioDocument } from './AudioDocument'

import type { SaveAudioRequest } from '@shared/ipc'

const saveAudio = vi.fn((_request: SaveAudioRequest) => Promise.resolve(asset))

// jsdom has no AudioContext and wavesurfer needs a real canvas: both are exercised by hand.
// What this covers is the chain — which tool appends which step, and what reaches the disk.
const decodeAsset = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ sampleRate: 100, channels: [new Float32Array(200).fill(0.5)] })),
)

vi.mock('@/helpers/audioDecode', () => ({ decodeAsset }))

vi.mock('@/hooks/useWaveSurfer', () => ({
  useWaveSurfer: () => ({ playing: false, currentTime: 0, toggle: vi.fn(), seek: vi.fn() }),
}))

// Partial: the stores this document pulls in reach for the rest of the module, and a total mock
// would have to grow an entry every time the bridge gains one.
vi.mock('@/services/bridge', async importOriginal => ({
  ...(await importOriginal<typeof Bridge>()),
  getBridge: () => ({ assets: { saveAudio } }),
}))

vi.mock('@/features/shell/components/otioExport', () => ({
  exportOtio: vi.fn(() => Promise.resolve('Bande.otio')),
}))

const asset: Asset = {
  id: 'asset-1',
  name: 'pad.wav',
  type: 'audio',
  location: 'local',
  tags: [],
  createdAt: '2026-08-07T10:00:00.000Z',
}

/** The block every test here edits — the editor below the montage shows the selected one. */
const CLIP = 'clip-1'

const laidAssetIds = (): string[] =>
  sequenceOf(useSequences.getState(), 'doc-1')
    .tracks.flatMap(track => track.clips)
    .map(clip => clip.assetId)

/** A montage holding one two-second block of `asset-1`, selected — what the editor shows. */
function montageWithTake(): void {
  const laid = addClip(
    'A1',
    makeClip({ id: CLIP, assetId: 'asset-1', start: 0, duration: 2 * SECOND }),
  ).apply(EMPTY_SOUND_SEQUENCE)

  useSequences.setState({
    states: { 'doc-1': { ...laid, selectedId: CLIP } },
    histories: {},
  })
}

// Every suite in this file, not one: a document left behind sends `useRestoredDocument`
// reaching for a bridge these tests do not mount.
beforeEach(() => {
  useDocuments.setState({ documents: {}, activeId: null })
  // Almost everything below works ON the take editor, which a tab hides by default: the decor
  // opens it, and the one suite about the default closes it again.
  useMonitorPair.setState({ clipShown: { 'doc-1': true } })
})

describe('dropping a take on the editor', () => {
  const emptyEditor = (): Element => {
    render(<AudioDocument documentId="doc-1" />)
    return (
      screen.getByText(/Sélectionnez un clip du montage/).closest('div[class]') ?? document.body
    )
  }

  // The montage too, and not only the chain: a block left selected by the suite above is a
  // block the editor would show, and this one is about the editor with nothing in it.
  beforeEach(() => {
    useSequences.setState({ states: { 'doc-1': EMPTY_SOUND_SEQUENCE }, histories: {} })
  })

  // The last space that accepted nothing: a take had to be double-clicked from the shelf, and
  // nothing on screen said the editor would have taken it.
  it('loads the take that was dropped on the empty editor', async () => {
    useAssets.setState({ items: [asset] })
    const dataTransfer = dragTransfer()
    startAssetDrag({ dataTransfer }, { id: 'asset-1', type: 'audio' })

    fireEvent.drop(emptyEditor(), { dataTransfer })

    // Settled first: a drop resolves through `droppedAsset`, which may fetch a library asset
    // before handing it over, so the answer lands a microtask later even when nothing was fetched.
    await Promise.resolve()

    // A block, and the selection that puts it under the editor: dropping on the editor is the
    // gesture, laying it on the montage is what the gesture now means.
    expect(laidAssetIds()).toEqual(['asset-1'])
    expect(sequenceOf(useSequences.getState(), 'doc-1').selectedId).not.toBeNull()
  })

  // A tab that only says "undecodable" is a dead end: the gesture that would replace the take
  // is the very one it stopped accepting.
  it('still takes a drop once the take it holds turned out to be undecodable', async () => {
    decodeAsset.mockRejectedValueOnce(new Error('not audio'))
    useAssets.setState({ items: [asset, { ...asset, id: 'asset-2', name: 'other.wav' }] })
    montageWithTake()

    render(<AudioDocument documentId="doc-1" />)
    const dead = await screen.findByText(/n’a pas pu être décodé/)

    const dataTransfer = dragTransfer()
    startAssetDrag({ dataTransfer }, { id: 'asset-2', type: 'audio' })
    fireEvent.drop(dead.closest('div[class]') ?? document.body, { dataTransfer })
    await Promise.resolve()

    // Laid over the block the head stands on, which is the one that would not decode.
    expect(laidAssetIds()).toEqual(['asset-2'])
  })

  it('refuses a picture, which the editor has nothing to do with', () => {
    useAssets.setState({ items: [{ ...asset, id: 'asset-pic', type: 'image' }] })
    const dataTransfer = dragTransfer()
    startAssetDrag({ dataTransfer }, { id: 'asset-pic', type: 'image' })

    // A refused drag is one the browser never lets land: `preventDefault` is not called.
    expect(fireEvent.dragOver(emptyEditor(), { dataTransfer })).toBe(true)
  })
})
