import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type * as Bridge from '@/services/bridge'
import { canUndo } from '@/engines/core/history'
import { chainOf, EMPTY_AUDIO_EDIT, withChain, type TakeChain } from '@/engines/audio/edits'
import { SECOND } from '@shared/domain/time'
import { addClip } from '@/engines/timeline/commands'
import { makeClip, updateClip, EMPTY_SOUND_SEQUENCE } from '@/engines/timeline/timelineState'
import { useAssets } from '@/stores/assets'
import { sequenceOf, useSequences } from '@/stores/sequences'
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

/** That block's chain written back, out of the history, as the editor writes a region. */
function writeChain(fields: Partial<TakeChain>): void {
  const store = useAudioEdits.getState()
  const current = audioEditsOf(store, 'doc-1')
  store.replace('doc-1', withChain(current, CLIP, { ...chainOf(current, CLIP), ...fields }))
}

/** The block the editor is on — the montage of these suites holds it first on its only track. */
const takeClip = () => sequenceOf(useSequences.getState(), 'doc-1').tracks[0]?.clips[0]

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
  it('shows both halves of the pair, each saying which one it is', async () => {
    await openTake()

    expect(screen.getByText(/La prise que vous éditez/)).toBeInTheDocument()
    expect(screen.getByText(/Le montage entier/)).toBeInTheDocument()
  })

  /**
   * The pair is stacked here, so the divider sets a HEIGHT — and it is the montage above that
   * keeps it. `useSplitPair` is tested on its own arithmetic; this is the only thing that says
   * its answer landed on the right box of this tab, on the right axis.
   */
  it('gives the montage a height of its own once the divider is dragged', async () => {
    await openTake()
    const divider = screen.getByRole('separator', { hidden: true })

    fireEvent.pointerDown(divider, { pointerId: 1, clientY: 400 })
    fireEvent.pointerMove(divider, { pointerId: 1, clientY: 200 })

    const montage = screen.getByText(/Le montage entier/).closest('section')?.parentElement
    expect(montage?.style.height).not.toBe('')
    expect(montage?.style.width).toBe('')
  })

  // A montage with nothing selected: the editor below has no block to show, and says which
  // gesture would give it one rather than looking broken.
  it('asks for a selection when no block is picked', () => {
    render(<AudioDocument documentId="doc-1" />)
    expect(screen.getByText(/Sélectionnez un clip du montage/)).toBeInTheDocument()
  })

  it('appends a step rather than rewriting the take', async () => {
    await openTake()
    await userEvent.click(screen.getByRole('button', { name: /Normaliser/ }))

    expect(editsOf().edits).toEqual([{ kind: 'normalize', targetLufs: -14 }])
    expect(canUndo(audioHistoryOf(useAudioEdits.getState(), 'doc-1'))).toBe(true)
  })

  /**
   * The two tools that CUT land on the block's bounds and leave the chain empty, cutting being
   * a montage gesture wherever it is made from. As a STEP, each was replayed over the slice it
   * had just produced and ate into it again on every render.
   */
  it('trims the block to what is not silence at its two ends', async () => {
    const quiet = new Float32Array(200)
    quiet.fill(0.5, 50, 150)
    decodeAsset.mockResolvedValueOnce({ sampleRate: 100, channels: [quiet] })
    await openTake()

    await userEvent.click(screen.getByRole('button', { name: /Couper les silences/ }))

    await waitFor(() => expect(takeClip()?.inPoint).toBe(500_000))
    expect(takeClip()?.duration).toBe(1_000_000)
    expect(editsOf().edits).toEqual([])
  })

  it('refuses to crop with nothing selected, rather than emptying the take', async () => {
    await openTake()
    await userEvent.click(screen.getByRole('button', { name: /Rogner/ }))

    expect(takeClip()?.duration).toBe(2 * SECOND)
  })

  it('crops the block to the selected region', async () => {
    await openTake()
    writeChain({ region: { from: 0, to: 500_000 } })

    await userEvent.click(screen.getByRole('button', { name: /Rogner/ }))

    // 13 frames at 25 fps rather than the 12.5 asked for: a block lands on the frame grid,
    // exactly as one laid down by hand does.
    await waitFor(() => expect(takeClip()?.duration).toBe(520_000))
    expect(editsOf().edits).toEqual([])
  })

  /**
   * Cutting says nothing about a level, and only `clampFades` may say what is left of a ramp.
   * Written from the SLICE — where both are zero by construction — a crop wiped what a hand had
   * laid on the strip, which is the very defect the slice was introduced to stop.
   */
  it('leaves the block its ramps and its level when it crops', async () => {
    await openTake()
    useSequences.setState(state => ({
      states: {
        ...state.states,
        'doc-1': updateClip(sequenceOf(state, 'doc-1'), CLIP, clip => ({
          ...clip,
          fadeIn: 200_000,
          gain: -4,
        })),
      },
    }))
    writeChain({ region: { from: 0, to: 500_000 } })

    await userEvent.click(screen.getByRole('button', { name: /Rogner/ }))

    await waitFor(() => expect(takeClip()?.duration).toBe(520_000))
    expect(takeClip()?.fadeIn).toBe(200_000)
    expect(takeClip()?.gain).toBe(-4)
  })
})
