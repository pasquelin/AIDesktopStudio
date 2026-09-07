import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type * as Bridge from '@/services/bridge'
import { canUndo } from '@/engines/core/history'
import { chainOf, EMPTY_AUDIO_EDIT, type TakeChain } from '@/engines/audio/edits'
import { SECOND } from '@shared/domain/time'
import { addClip } from '@/engines/timeline/commands'
import { makeClip, EMPTY_SOUND_SEQUENCE } from '@/engines/timeline/timelineState'
import { useAssets } from '@/stores/assets'
import { sequenceOf, sequenceStore, useSequences } from '@/stores/sequences'
import { audioEditsOf, audioHistoryOf, useAudioEdits } from '@/stores/audioEdits'
import { useDocuments } from '@/stores/documents'
import { useMonitorPair } from '@/stores/monitorPair'
import { installDocuments } from '@/stores/document-fixtures'
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

const editsOf = (clipId: string = CLIP): TakeChain =>
  chainOf(audioEditsOf(useAudioEdits.getState(), 'doc-1'), clipId)

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

async function openTake({ inFront = true }: { inFront?: boolean } = {}): Promise<void> {
  useAudioEdits.setState({ states: { 'doc-1': EMPTY_AUDIO_EDIT }, histories: {} })
  montageWithTake()
  // Two tabs when the take is meant to be behind: what puts another document in front is
  // another document, not an empty `activeId`.
  installDocuments(
    inFront ? { 'doc-1': 'audio' } : { 'doc-1': 'audio', 'doc-2': 'audio' },
    inFront ? 'doc-1' : 'doc-2',
  )
  render(<AudioDocument documentId="doc-1" />)
  // The chain is replayed off this thread now, so the take is not there on the first render:
  // a tool clicked while it still says "loading" would act on nothing.
  await waitFor(() => expect(screen.queryByText(/Chargement/)).not.toBeInTheDocument())
}

describe('AudioDocument', () => {
  beforeEach(() => {
    saveAudio.mockClear()
    useAssets.setState({ items: [asset] })
    useSequences.setState({ states: { 'doc-1': EMPTY_SOUND_SEQUENCE }, histories: {} })
  })

  /**
   * What a montage tab is FOR is the montage: the take editor is the half one opens when a take
   * needs work, and it used to take half the column whether or not anything was being worked on.
   */
  it('keeps A/B off the undo stack: it changes what is heard, not what was done', async () => {
    await openTake()
    await userEvent.click(screen.getByRole('button', { name: /A\/B/ }))

    expect(editsOf().bypassed).toBe(true)
    expect(canUndo(audioHistoryOf(useAudioEdits.getState(), 'doc-1'))).toBe(false)
  })

  /**
   * A take is one asset behind however many blocks — in this montage and in every other document
   * open on the project. "Apply" used to replace it under its own id, which moved all of them at
   * once, silently, to bytes only this block had asked for.
   */
  it('writes beside the source on apply, never over it', async () => {
    await openTake()
    await userEvent.click(screen.getByRole('button', { name: /Appliquer/ }))

    await waitFor(() => expect(saveAudio).toHaveBeenCalled())
    expect(saveAudio.mock.calls[0]?.[0]).toEqual(
      expect.not.objectContaining({ replaces: expect.anything() }),
    )
    expect(saveAudio.mock.calls[0]?.[0]).toMatchObject({
      derivedFrom: 'asset-1',
      name: 'pad.wav (édité)',
    })
  })

  it('points the block at what apply wrote', async () => {
    await openTake()
    saveAudio.mockResolvedValueOnce({ ...asset, id: 'asset-2' })

    await userEvent.click(screen.getByRole('button', { name: /Appliquer/ }))

    await waitFor(() => expect(laidAssetIds()).toEqual(['asset-2']))
  })

  /**
   * Which take a block plays is held by the MONTAGE and by nothing else — the chain that asked
   * for it is dropped by the same button. Left unmarked, ⌘W closes the tab without asking and the
   * block reopens on the original take, brut: the whole edit gone, and the derived file orphaned.
   */
  it('leaves work to save once apply has repointed the block', async () => {
    await openTake()
    const clean = useSequences.getState()
    clean.markSaved('doc-1', sequenceStore.markOf(clean, 'doc-1'))
    saveAudio.mockResolvedValueOnce({ ...asset, id: 'asset-2' })

    await userEvent.click(screen.getByRole('button', { name: /Appliquer/ }))

    await waitFor(() => expect(laidAssetIds()).toEqual(['asset-2']))
    expect(sequenceStore.hasUnsavedWork(useSequences.getState(), 'doc-1')).toBe(true)
  })

  // The difference between the two buttons, and the whole of it: one moves the montage on, the
  // other only adds to the shelf.
  it('writes beside the source on save as, and leaves the montage where it was', async () => {
    await openTake()
    saveAudio.mockResolvedValueOnce({ ...asset, id: 'asset-2' })

    await userEvent.click(screen.getByRole('button', { name: /Enregistrer comme nouveau/ }))

    await waitFor(() => expect(saveAudio).toHaveBeenCalled())
    expect(saveAudio.mock.calls[0]?.[0]).toMatchObject({
      derivedFrom: 'asset-1',
      name: 'pad.wav (édité)',
    })
    expect(laidAssetIds()).toEqual(['asset-1'])
  })

  it('hands the disk a real wav, not an empty buffer', async () => {
    await openTake()
    await userEvent.click(screen.getByRole('button', { name: /Appliquer/ }))

    await waitFor(() => expect(saveAudio).toHaveBeenCalled())
    const wav = saveAudio.mock.calls[0]?.[0].wav ?? new Uint8Array()
    // 200 mono frames at 16 bits, behind a 44-byte header.
    expect(wav.byteLength).toBe(44 + 200 * 2)
  })

  /**
   * The file now HOLDS the chain. Replaying it over the new bytes would lay every fade and gain
   * down a second time, and the montage clip below — which carries them too — would play them a
   * third. A step undone afterwards would describe a length the file no longer has.
   */
  it('empties the chain and its history once the take has been written over', async () => {
    await openTake()
    await userEvent.click(screen.getByRole('button', { name: /Normaliser/ }))
    expect(editsOf().edits).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: /Appliquer/ }))
    await waitFor(() => expect(editsOf().edits).toEqual([]))

    // The block stays where it is, holding the take it always held: what was emptied is its
    // chain, not the montage under it.
    expect(laidAssetIds()).toEqual(['asset-1'])
    expect(canUndo(audioHistoryOf(useAudioEdits.getState(), 'doc-1'))).toBe(false)
  })

  // "Save as" writes a NEW asset: the take under the editor is untouched, and so is its chain.
  it('keeps the chain when the take is written beside the source', async () => {
    await openTake()
    await userEvent.click(screen.getByRole('button', { name: /Normaliser/ }))

    await userEvent.click(screen.getByRole('button', { name: /Enregistrer comme nouveau/ }))
    await waitFor(() => expect(saveAudio).toHaveBeenCalled())

    expect(editsOf().edits).toHaveLength(1)
  })
})
