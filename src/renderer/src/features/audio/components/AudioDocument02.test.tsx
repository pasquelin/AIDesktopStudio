import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type * as Bridge from '@/services/bridge'
import {
  chainOf,
  EMPTY_AUDIO_EDIT,
  pushEdit,
  withChain,
  type TakeChain,
} from '@/engines/audio/edits'
import { SECOND } from '@shared/domain/time'
import { addClip } from '@/engines/timeline/commands'
import { makeClip, updateClip, EMPTY_SOUND_SEQUENCE } from '@/engines/timeline/timelineState'
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
  describe('the clip it keeps in step', () => {
    /** A document whose take is laid on the strip and selected, as `loadTake` leaves it. */
    async function openLaidTake(): Promise<void> {
      montageWithTake()
      useAudioEdits.setState({ states: { 'doc-1': EMPTY_AUDIO_EDIT }, histories: {} })
      installDocuments({ 'doc-1': 'audio' }, 'doc-1')
      render(<AudioDocument documentId="doc-1" />)
      await waitFor(() => expect(screen.queryByText(/Chargement/)).not.toBeInTheDocument())
    }

    // 13 frames at 25 fps rather than the 12.5 the crop asked for: a clip lands on the frame
    // grid, exactly as one laid down by hand does — a tail off the grid snaps to nothing.
    const CROPPED = 520_000

    it('shortens the clip when the take is cropped', async () => {
      await openLaidTake()
      await waitFor(() => expect(takeClip()?.duration).toBe(2_000_000))

      writeChain({ region: { from: 0, to: 500_000 } })
      await userEvent.click(screen.getByRole('button', { name: /Rogner/ }))

      await waitFor(() => expect(takeClip()?.duration).toBe(CROPPED))
    })

    /**
     * The crop went on the MONTAGE's stack, being a montage gesture, and `AudioDocument` sends
     * ⌘Z there once the chain has nothing left to give back. Anywhere else and the block would
     * keep a length the editor no longer plays — the two halves saying different things about
     * one take, which is the very thing this pair exists to stop.
     */
    it('gives the block its length back when the crop is undone', async () => {
      await openLaidTake()
      writeChain({ region: { from: 0, to: 500_000 } })
      await userEvent.click(screen.getByRole('button', { name: /Rogner/ }))
      await waitFor(() => expect(takeClip()?.duration).toBe(CROPPED))

      await userEvent.keyboard('{Meta>}{z}{/Meta}')

      await waitFor(() => expect(takeClip()?.duration).toBe(2_000_000))
    })

    /**
     * "Apply" writes the slice INTO a file of its own, so the block has to be laid flat over it:
     * it carries the ramps and the level too, and a block left describing them plays them a
     * second time over bytes that already hold them — six decibels above what the editor sounds
     * like, or a block pointing into a file that starts where the block does.
     */
    it('lays the block flat over the file apply wrote', async () => {
      await openLaidTake()
      writeChain({ region: { from: 0, to: 500_000 } })
      await userEvent.click(screen.getByRole('button', { name: /Rogner/ }))
      await waitFor(() => expect(takeClip()?.duration).toBe(CROPPED))
      saveAudio.mockResolvedValueOnce({ ...asset, id: 'asset-2' })

      await userEvent.click(screen.getByRole('button', { name: /Appliquer/ }))

      await waitFor(() => expect(takeClip()?.assetId).toBe('asset-2'))
      // The new file IS the slice, so the block spans the whole of it from its first sample.
      expect(takeClip()?.inPoint).toBe(0)
      expect(takeClip()?.duration).toBe(CROPPED)
    })

    /**
     * Dragging a region writes an entry into `chains` — a region is where one is LOOKING, and it
     * has to be remembered. Read as "the tools own this block", that entry let an empty chain
     * project no ramp and no level onto a clip that carried both from the strip: one drag on the
     * wave, and a fade laid by hand was gone. `touched` is what answers that question now.
     */
    it('leaves a hand-laid fade alone when the wave is merely dragged over', async () => {
      await openLaidTake()
      useSequences.setState(state => ({
        states: {
          ...state.states,
          'doc-1': updateClip(sequenceOf(state, 'doc-1'), CLIP, clip => ({
            ...clip,
            fadeIn: 300_000,
            gain: -4,
          })),
        },
      }))

      writeChain({ region: { from: 0, to: 500_000 } })

      await waitFor(() => expect(editsOf().region).not.toBeNull())
      expect(takeClip()?.fadeIn).toBe(300_000)
      expect(takeClip()?.gain).toBe(-4)
    })

    /**
     * Two blocks of the SAME take — a split, or the same sound laid down twice — and the render
     * in hand belongs to whichever was selected a moment ago. Tagged by asset alone, the answer
     * for one was written onto the other the instant the selection moved: same asset, so it read
     * as current. It settles there, too, because the write moves the bounds the next render is
     * asked for.
     */
    it('never writes one block’s shape onto its neighbour on the same take', async () => {
      await openLaidTake()
      const second = makeClip({
        id: 'clip-2',
        assetId: 'asset-1',
        start: 3 * SECOND,
        duration: SECOND,
      })
      useSequences.getState().runCommand('doc-1', addClip('A1', second))
      // Both tooled, so neither is held back by `touched`.
      useAudioEdits.getState().runCommand('doc-1', pushEdit(CLIP, { kind: 'gain', db: -3 }))
      useAudioEdits.getState().runCommand('doc-1', pushEdit('clip-2', { kind: 'gain', db: -3 }))

      useSequences.setState(state => ({
        states: {
          ...state.states,
          'doc-1': { ...sequenceOf(state, 'doc-1'), selectedId: 'clip-2' },
        },
      }))

      await waitFor(() => expect(editsOf('clip-2').edits).toHaveLength(1))
      const moved = sequenceOf(useSequences.getState(), 'doc-1').tracks[0]?.clips.find(
        one => one.id === 'clip-2',
      )
      expect(moved?.start).toBe(3 * SECOND)
      expect(moved?.duration).toBe(SECOND)
    })

    /**
     * A bypassed render is asked for an EMPTY chain, so the shape that comes back is the whole
     * untouched take. Written down, one press of A/B would stretch the clip back to the source —
     * turning a listening aid into an edit of the montage.
     */
    it('leaves the clip alone while A/B is held on the source', async () => {
      await openLaidTake()
      writeChain({ region: { from: 0, to: 500_000 } })
      await userEvent.click(screen.getByRole('button', { name: /Rogner/ }))
      await waitFor(() => expect(takeClip()?.duration).toBe(CROPPED))

      await userEvent.click(screen.getByRole('button', { name: /A\/B/ }))

      await waitFor(() => expect(editsOf().bypassed).toBe(true))
      expect(takeClip()?.duration).toBe(CROPPED)
    })

    // And on the way back: the press that leaves bypass re-runs the write before its own render
    // has landed, so what is in hand at that moment is still the BYPASSED answer.
    it('leaves the clip alone on the press that comes back off A/B', async () => {
      await openLaidTake()
      writeChain({ region: { from: 0, to: 500_000 } })
      await userEvent.click(screen.getByRole('button', { name: /Rogner/ }))
      await waitFor(() => expect(takeClip()?.duration).toBe(CROPPED))

      await userEvent.click(screen.getByRole('button', { name: /A\/B/ }))
      await waitFor(() => expect(editsOf().bypassed).toBe(true))
      await userEvent.click(screen.getByRole('button', { name: /A\/B/ }))
      await waitFor(() => expect(editsOf().bypassed).toBe(false))

      expect(takeClip()?.duration).toBe(CROPPED)
    })
  })

  /**
   * The pair is what the space was missing: an editor alone showed ONE take while the strip
   * below showed several, and nothing on screen said how the two were related. Each half says
   * which one it is, under its own bar — that line is the whole explanation.
   */
})
