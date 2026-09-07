import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { addClip } from '@/engines/timeline/commands'
import { RULER_HEIGHT, tracksHeight } from '@/engines/timeline/timelineGeometry'
import { clipFixture } from '@/engines/timeline/timeline-fixtures'
import type { Clip } from '@/engines/timeline/timelineState'
import { EMPTY_SEQUENCE, EMPTY_SOUND_SEQUENCE } from '@/engines/timeline/timelineState'
import { startAssetDrag } from '@/helpers/assetDrag'
import { dragTransfer } from '@/helpers/drag-fixtures'
import { fakeMenu } from '@/helpers/menu-fixtures'
import { exportOtio } from '@/features/shell/components/otioExport'
import { publishCommand } from '@/services/commandBus'
import { installFakeBridge } from '@/services/fakeBridge'
import { installSequence } from '@/stores/sequence-fixtures'
import { useAssets } from '@/stores/assets'
import { installDocuments, retitleDocument } from '@/stores/document-fixtures'
import { exportSequence } from './sequenceExport'
import { useSelection } from '@/stores/selection'
import { sequenceOf, useSequences } from '@/stores/sequences'
import { usePlayback } from '@/stores/playback'
import { useProject } from '@/stores/project'
import { useTimelineView } from '@/stores/timelineView'
import { TIMELESS_DURATION } from '@/engines/timeline/insert'
import { TimelineCanvas } from './TimelineCanvas'
import type { VideoToolId } from '../videoTools'

vi.mock('@/features/shell/components/otioExport', () => ({
  exportOtio: vi.fn(() => Promise.resolve('Bande.otio')),
}))
vi.mock('./sequenceExport', () => ({ exportSequence: vi.fn(() => Promise.resolve('Bande.mp4')) }))

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'asset-1',
  name: 'rush.mp4',
  type: 'video',
  location: 'local',
  tags: [],
  createdAt: '2026-08-07T10:00:00.000Z',
  ...overrides,
})

const clip = clipFixture('clip-1', 0, 1_000_000, { assetId: 'asset-1' })

function dataTransfer(assetId: string): DataTransfer {
  const transfer = dragTransfer()
  if (assetId) startAssetDrag({ dataTransfer: transfer }, { id: assetId, type: 'video' })
  return transfer
}

function desktopFiles(...names: string[]): DataTransfer {
  const transfer = dragTransfer()
  transfer.setData('Files', '')
  Object.defineProperty(transfer, 'files', {
    value: names.map(name => new File(['content'], name)),
  })
  return transfer
}

const desktopFile = (name = 'rush.mp4'): DataTransfer => desktopFiles(name)

function paint(tool: VideoToolId = 'select') {
  const view = render(<TimelineCanvas documentId="doc-1" tool={tool} />)
  const canvas = view.container.querySelector('canvas')
  if (!canvas) throw new Error('the timeline renders no canvas')
  return canvas
}

const clipsOf = (): Clip[] => sequenceOf(useSequences.getState(), 'doc-1').tracks[0]?.clips ?? []

let menu = fakeMenu()

describe('TimelineCanvas', () => {
  beforeEach(() => {
    useTimelineView.setState({ viewports: {} })
    usePlayback.setState({ running: {}, heads: {} })
    // Reinstalled rather than assumed: one case below drops the document on purpose.
    installSequence('doc-1')
    useAssets.setState({ items: [asset()] })
    useSelection.getState().selectFiles([])
    useProject.setState({
      known: true,
      project: {
        path: '/projects/one',
        manifest: {
          version: 1,
          createdAt: '2026-09-04T00:00:00.000Z',
          updatedAt: '2026-09-04T00:00:00.000Z',
        },
      },
    })
    menu = fakeMenu()
    installFakeBridge({ menu: menu.bridge })
  })

  it('turns a dropped asset into a clip on the track it landed on', async () => {
    fireEvent.drop(paint(), {
      clientX: 200,
      clientY: RULER_HEIGHT + 10,
      dataTransfer: dataTransfer('asset-1'),
    })

    // Settled first: a drop resolves through `droppedAsset`, which fetches a library asset
    // before handing it over — so the clip is added a microtask after the gesture.
    await Promise.resolve()

    expect(clipsOf()).toHaveLength(1)
    expect(clipsOf()[0]).toMatchObject({ assetId: 'asset-1', start: 2_000_000 })
  })

  it('imports a desktop video onto the track it was dropped on', async () => {
    const imported = asset({ id: 'asset-desktop' })
    installFakeBridge({
      externalFiles: { offer: async () => ({ request: { id: 'request-1' }, refused: [] }) },
      media: {
        ingestPaths: async () => ({
          assets: [imported],
          documents: [],
          montages: [],
          refused: [],
          failed: [],
        }),
      },
    })

    fireEvent.drop(paint(), {
      clientX: 200,
      clientY: RULER_HEIGHT + 10,
      dataTransfer: desktopFile(),
    })

    await waitFor(() => expect(clipsOf()[0]).toMatchObject({ assetId: 'asset-desktop' }))
  })

  it('refuses an unsupported desktop file in red before it is dropped', () => {
    const canvas = paint()
    const transfer = desktopFile('notes.txt')

    fireEvent.dragOver(canvas, {
      clientX: 200,
      clientY: RULER_HEIGHT + 10,
      dataTransfer: transfer,
    })

    expect(canvas.className).toContain('outline-danger')
    expect(transfer.dropEffect).toBe('none')
  })

  it('warns in red while allowing a mixed desktop batch', () => {
    const canvas = paint()
    const transfer = desktopFiles('rush.mp4', 'notes.txt')

    fireEvent.dragOver(canvas, {
      clientX: 200,
      clientY: RULER_HEIGHT + 10,
      dataTransfer: transfer,
    })

    expect(canvas.className).toContain('outline-danger')
    expect(transfer.dropEffect).toBe('copy')
  })

  it('leaves a desktop video dropped on the ruler to the shell', () => {
    const ingestPaths = vi.fn()
    installFakeBridge({ media: { ingestPaths } })
    const shell = vi.fn()
    document.body.addEventListener('drop', shell)

    fireEvent.drop(paint(), {
      clientX: 200,
      clientY: 4,
      dataTransfer: desktopFile(),
    })
    document.body.removeEventListener('drop', shell)

    expect(shell).toHaveBeenCalled()
    expect(ingestPaths).not.toHaveBeenCalled()
  })

  it('leaves a desktop video below a sound montage to the shell', () => {
    act(() => useSequences.getState().replace('doc-1', EMPTY_SOUND_SEQUENCE))
    const ingestPaths = vi.fn()
    installFakeBridge({ media: { ingestPaths } })
    const shell = vi.fn()
    document.body.addEventListener('drop', shell)

    fireEvent.drop(paint(), {
      clientX: 200,
      clientY: RULER_HEIGHT + tracksHeight(EMPTY_SOUND_SEQUENCE) + 20,
      dataTransfer: desktopFile(),
    })
    document.body.removeEventListener('drop', shell)

    expect(shell).toHaveBeenCalled()
    expect(ingestPaths).not.toHaveBeenCalled()
  })

  it('gives a clip the probed duration of its asset', async () => {
    useAssets.setState({ items: [asset({ probe: { duration: 8_000_000, codec: 'avc1' } })] })

    fireEvent.drop(paint(), {
      clientX: 0,
      clientY: RULER_HEIGHT + 10,
      dataTransfer: dataTransfer('asset-1'),
    })

    // Settled first: a drop resolves through `droppedAsset`, which fetches a library asset
    // before handing it over — so the clip is added a microtask after the gesture.
    await Promise.resolve()

    expect(clipsOf()[0]?.duration).toBe(8_000_000)
  })

  it('falls back to a default length for an asset that has not been probed yet', async () => {
    fireEvent.drop(paint(), {
      clientX: 0,
      clientY: RULER_HEIGHT + 10,
      dataTransfer: dataTransfer('asset-1'),
    })

    // Settled first: a drop resolves through `droppedAsset`, which fetches a library asset
    // before handing it over — so the clip is added a microtask after the gesture.
    await Promise.resolve()

    expect(clipsOf()[0]?.duration).toBe(TIMELESS_DURATION)
  })

  it('refuses a drop on the ruler, which holds no track', () => {
    fireEvent.drop(paint(), { clientX: 200, clientY: 4, dataTransfer: dataTransfer('asset-1') })
    expect(clipsOf()).toHaveLength(0)
  })

  /** Well below the last row of a montage that opens on two, whatever their height. */
  const BELOW_THE_TRACKS = RULER_HEIGHT + tracksHeight(EMPTY_SEQUENCE) + 20

  it('opens the rows a drop below the last track needs, rather than refusing it', async () => {
    useAssets.setState({
      items: [asset({ probe: { duration: 5_000_000, codec: 'avc1', channels: 2 } })],
    })

    fireEvent.drop(paint(), {
      clientX: 200,
      clientY: BELOW_THE_TRACKS,
      dataTransfer: dataTransfer('asset-1'),
    })

    // Settled first: a drop resolves through `droppedAsset`, which fetches a library asset
    // before handing it over — so the clip is added a microtask after the gesture.
    await Promise.resolve()

    const { tracks } = sequenceOf(useSequences.getState(), 'doc-1')
    expect(tracks.map(track => track.id)).toEqual(['V1', 'A1', 'V2', 'A2'])
    expect(tracks[2]?.clips[0]).toMatchObject({ assetId: 'asset-1', start: 2_000_000 })
    expect(tracks[3]?.clips).toHaveLength(1)
  })

  // Left to bubble rather than swallowed, so the shell still answers it by opening the asset:
  // the Audio workspace has no monitor to paint a rush on, and opens no picture row for one.
  it('leaves a rush dropped below a sound montage to the shell', () => {
    act(() => {
      useSequences.getState().replace('doc-1', EMPTY_SOUND_SEQUENCE)
    })

    const shell = vi.fn()
    document.body.addEventListener('drop', shell)
    fireEvent.drop(paint(), {
      clientX: 200,
      // Its own rows, which outnumber a sequence's: the empty space starts lower here.
      clientY: RULER_HEIGHT + tracksHeight(EMPTY_SOUND_SEQUENCE) + 20,
      dataTransfer: dataTransfer('asset-1'),
    })
    document.body.removeEventListener('drop', shell)

    expect(shell).toHaveBeenCalled()
    expect(sequenceOf(useSequences.getState(), 'doc-1').tracks).toHaveLength(4)
  })

  // The one half `AssetDropTarget` shares with it: a surface that prevents every dragover
  // swallows the files dragged in from the desktop, and the drop then does nothing.
  it('leaves a file dragged in from the desktop alone', () => {
    const transfer = dragTransfer()
    transfer.setData('text/plain', 'anything')

    expect(fireEvent.dragOver(paint(), { dataTransfer: transfer })).toBe(true)
  })

  it('lets a drag of ours land', () => {
    expect(fireEvent.dragOver(paint(), { dataTransfer: dataTransfer('asset-1') })).toBe(false)
  })

  it('ignores a drag that carries something other than an asset', () => {
    fireEvent.drop(paint(), {
      clientX: 200,
      clientY: RULER_HEIGHT + 10,
      dataTransfer: dataTransfer(''),
    })

    expect(clipsOf()).toHaveLength(0)
  })

  /**
   * The one command of this strip with no key of its own, so no keyboard test reaches it: it
   * arrives from the File menu through the bus, and nothing else here proves that it lands.
   */
  it('writes the montage out as a cut when the menu asks for it', () => {
    paint()

    act(() => publishCommand('sequence.exportCut'))

    expect(exportOtio).toHaveBeenCalledWith('doc-1')
  })

  // The film's door, where the cut's door beside it has cleaned its title since the day it was
  // written — same tab, same title, and only one of the two came back refused.
  it('cleans the title down to a file name before the render dialog is asked', () => {
    installDocuments({ 'doc-1': 'video' }, 'doc-1')
    retitleDocument('doc-1', 'Brique 1/2')
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    paint()

    act(() => publishCommand('sequence.export'))

    expect(exportSequence).toHaveBeenCalledWith(expect.objectContaining({ title: 'Brique 1 2' }))
  })

  it('deletes the selected clip on Delete', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))

    fireEvent.keyDown(paint(), { code: 'Delete' })

    expect(clipsOf()).toHaveLength(0)
  })

  it('leaves the sequence alone on Delete with nothing selected', () => {
    useSequences.setState({
      states: {
        'doc-1': { ...EMPTY_SEQUENCE, tracks: [{ ...EMPTY_SEQUENCE.tracks[0]!, clips: [clip] }] },
      },
    })

    fireEvent.keyDown(paint(), { code: 'Delete' })

    expect(clipsOf()).toHaveLength(1)
  })

  /**
   * While a transport runs, the head belongs to the CLOCK and the montage stops carrying it: a cut
   * reading the document's own head would fall where the head stood before Play was pressed, and
   * `clipUnderPlayhead` would even name the wrong clip.
   */
})
