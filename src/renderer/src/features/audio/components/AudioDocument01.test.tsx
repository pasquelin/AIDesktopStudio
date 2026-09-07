import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type * as Bridge from '@/services/bridge'
import { chainOf, EMPTY_AUDIO_EDIT, withChain, type TakeChain } from '@/engines/audio/edits'
import { exportOtio } from '@/features/shell/components/otioExport'
import { publishCommand } from '@/services/commandBus'
import { SECOND } from '@shared/domain/time'
import { addClip } from '@/engines/timeline/commands'
import { makeClip, EMPTY_SOUND_SEQUENCE } from '@/engines/timeline/timelineState'
import { useAssets } from '@/stores/assets'
import { sequenceOf, useSequences } from '@/stores/sequences'
import { audioEditsOf, useAudioEdits } from '@/stores/audioEdits'
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

/** That block's chain written back, out of the history, as the editor writes a region. */
function writeChain(fields: Partial<TakeChain>): void {
  const store = useAudioEdits.getState()
  const current = audioEditsOf(store, 'doc-1')
  store.replace('doc-1', withChain(current, CLIP, { ...chainOf(current, CLIP), ...fields }))
}

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
  describe('the take editor, which the tab hides by default', () => {
    beforeEach(() => useMonitorPair.setState({ clipShown: {} }))

    it('opens on the montage alone', async () => {
      useAudioEdits.setState({ states: { 'doc-1': EMPTY_AUDIO_EDIT }, histories: {} })
      montageWithTake()
      installDocuments({ 'doc-1': 'audio' }, 'doc-1')
      render(<AudioDocument documentId="doc-1" />)

      expect(screen.queryByRole('button', { name: /Rogner/ })).not.toBeInTheDocument()
    })

    it('shows and hides it on the button the montage monitor carries', async () => {
      useAudioEdits.setState({ states: { 'doc-1': EMPTY_AUDIO_EDIT }, histories: {} })
      montageWithTake()
      installDocuments({ 'doc-1': 'audio' }, 'doc-1')
      render(<AudioDocument documentId="doc-1" />)

      await userEvent.click(screen.getByRole('button', { name: 'Éditeur de prise' }))
      expect(await screen.findByRole('button', { name: /Rogner/ })).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Éditeur de prise' }))
      expect(screen.queryByRole('button', { name: /Rogner/ })).not.toBeInTheDocument()
    })
  })

  /**
   * The same montage as the Video space, so the same export. Nothing else here writes the cut
   * out, and a montage that exists only in a take's own file is the loss this whole chantier is against.
   */
  it('writes its montage out as a cut, on the command the Video space shares', async () => {
    await openTake()

    publishCommand('sequence.exportCut')

    expect(exportOtio).toHaveBeenCalledWith('doc-1')
  })

  it('says what its tools act on: the gesture while there is nothing, the range once there is', async () => {
    await openTake()
    expect(screen.getByText(/Glissez sur l’onde/)).toBeInTheDocument()

    writeChain({ region: { from: SECOND / 2, to: SECOND } })

    expect(await screen.findByText('Sélection 00:00.50 – 00:01.00')).toBeInTheDocument()
    // And the invitation goes: the bar says one thing at a time, or it says both at once.
    expect(screen.queryByText(/Glissez sur l’onde/)).not.toBeInTheDocument()
  })

  // Clamped like the tools clamp it: the take is two seconds long, so a range past its end is a
  // range no tool would touch, and announcing it would be the bar promising what nothing does.
  it('takes a selection the take no longer holds for no selection at all', async () => {
    await openTake()

    writeChain({ region: { from: 9 * SECOND, to: 12 * SECOND } })

    expect(await screen.findByText(/Glissez sur l’onde/)).toBeInTheDocument()
  })

  // The bar carried the only undo this space had until `audio.undo` was registered — which is
  // what let the pair leave every bar in the studio.
  describe('its history', () => {
    it('is not drawn on the bar', async () => {
      await openTake()
      expect(screen.queryByRole('button', { name: /Annuler/ })).not.toBeInTheDocument()
    })

    it('answers the key while the take is the tab in front', async () => {
      await openTake()
      await userEvent.click(screen.getByRole('button', { name: /Normaliser/ }))

      await userEvent.keyboard('{Meta>}{z}{/Meta}')

      expect(editsOf().edits).toEqual([])
    })

    it('stays deaf while another tab is in front', async () => {
      await openTake({ inFront: false })
      await userEvent.click(screen.getByRole('button', { name: /Normaliser/ }))

      await userEvent.keyboard('{Meta>}{z}{/Meta}')

      expect(editsOf().edits).toEqual([{ kind: 'normalize', targetLufs: -14 }])
    })

    // One key, one document, two stores: the montage under the take answers ⌘Z only when the
    // chain has nothing left to give back. Nothing else can reach it — the strip's own scope is
    // off, precisely so that one press never undoes both halves.
    it('gives the key to the montage when the chain has nothing to undo', async () => {
      await openTake()
      const clip = makeClip({
        id: 'clip-2',
        assetId: 'asset-a',
        start: 5 * SECOND,
        duration: SECOND,
      })
      useSequences.getState().runCommand('doc-1', addClip('A1', clip))

      await userEvent.keyboard('{Meta>}{z}{/Meta}')

      // The block the editor is on stays: it was laid outside the history, as `loadTake` lays it.
      expect(laidAssetIds()).toEqual(['asset-1'])
    })

    it('undoes the chain first, leaving the montage where it stands', async () => {
      await openTake()
      const clip = makeClip({
        id: 'clip-2',
        assetId: 'asset-a',
        start: 5 * SECOND,
        duration: SECOND,
      })
      useSequences.getState().runCommand('doc-1', addClip('A1', clip))
      await userEvent.click(screen.getByRole('button', { name: /Normaliser/ }))

      await userEvent.keyboard('{Meta>}{z}{/Meta}')

      expect(editsOf().edits).toEqual([])
      expect(laidAssetIds()).toEqual(['asset-1', 'asset-a'])
    })
  })

  // The take under the editor and the clip on the strip are two views of one thing.
})
