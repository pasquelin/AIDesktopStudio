import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { addClip } from '@/engines/timeline/commands'
import {
  RULER_HEIGHT,
  timeToX,
  tracksHeight,
  type Viewport,
} from '@/engines/timeline/timelineGeometry'
import { clipFixture } from '@/engines/timeline/timeline-fixtures'
import type { Clip } from '@/engines/timeline/timelineState'
import { EMPTY_SEQUENCE } from '@/engines/timeline/timelineState'
import { fakeMenu } from '@/helpers/menu-fixtures'
import { installFakeBridge } from '@/services/fakeBridge'
import { installSequence } from '@/stores/sequence-fixtures'
import { useAssets } from '@/stores/assets'
import { selectedFilePaths, useSelection } from '@/stores/selection'
import { sequenceOf, useSequences } from '@/stores/sequences'
import { usePlayback } from '@/stores/playback'
import { useTimelineView, viewportOf } from '@/stores/timelineView'
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

function paint(tool: VideoToolId = 'select') {
  const view = render(<TimelineCanvas documentId="doc-1" tool={tool} />)
  const canvas = view.container.querySelector('canvas')
  if (!canvas) throw new Error('the timeline renders no canvas')
  return canvas
}

const clipsOf = (): Clip[] => sequenceOf(useSequences.getState(), 'doc-1').tracks[0]?.clips ?? []

const viewOf = (): Viewport => viewportOf(useTimelineView.getState(), 'doc-1')

let menu = fakeMenu()

describe('TimelineCanvas', () => {
  beforeEach(() => {
    useTimelineView.setState({ viewports: {} })
    usePlayback.setState({ running: {}, heads: {} })
    // Reinstalled rather than assumed: one case below drops the document on purpose.
    installSequence('doc-1')
    useAssets.setState({ items: [asset()] })
    useSelection.getState().selectFiles([])
    menu = fakeMenu()
    installFakeBridge({ menu: menu.bridge })
  })

  it('takes back the last edit on the undo key, and puts it back on redo', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    const canvas = paint()

    fireEvent.keyDown(canvas, { code: 'KeyZ', metaKey: true })
    expect(clipsOf()).toHaveLength(0)

    fireEvent.keyDown(canvas, { code: 'KeyZ', metaKey: true, shiftKey: true })
    expect(clipsOf()).toHaveLength(1)
  })

  it('raises nothing over a gap, where there is no clip to act on', async () => {
    fireEvent.contextMenu(paint(), { clientX: 50, clientY: RULER_HEIGHT + 10 })

    await Promise.resolve()
    expect(menu.raised).toHaveLength(0)
  })

  it('drags the view under the hand tool, which was declared and did nothing', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clipFixture('c', 0, 60_000_000)))
    const canvas = paint('hand')

    fireEvent.pointerDown(canvas, { clientX: 300, clientY: RULER_HEIGHT + 30 })
    fireEvent.pointerMove(canvas, { clientX: 100, clientY: RULER_HEIGHT + 30 })

    // Dragged left by 200 px: the strip moves right, so the view starts later in the montage.
    expect(viewOf().offset).toBe(Math.round(200 / viewOf().scale))
  })

  /**
   * 🛑 The whole reason the montage holds its own pick. Pressing a clip used to write it into the
   * studio's single descriptor, which had room for one thing: the images picked in a shelf beside
   * it went away, and the generator's sources with them.
   */
  it('designates the clip that was pressed, and leaves what a shelf picked where it is', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    useSelection.getState().selectFiles(['Images/one.png', 'Images/two.png'])

    fireEvent.pointerDown(paint(), { clientX: 10, clientY: RULER_HEIGHT + 30 })

    expect(sequenceOf(useSequences.getState(), 'doc-1').selectedId).toBe('clip-1')
    expect(selectedFilePaths(useSelection.getState())).toEqual(['Images/one.png', 'Images/two.png'])
  })

  // A press in the void drops what the MONTAGE designated, and nothing else: it is not this
  // canvas's business to empty a shelf standing beside it.
  it('empties its own selection when the press lands in the void, and only its own', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    useSelection.getState().selectFiles(['Images/one.png'])
    const canvas = paint()
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: RULER_HEIGHT + 30 })

    fireEvent.pointerDown(canvas, {
      clientX: 10,
      clientY: RULER_HEIGHT + tracksHeight(EMPTY_SEQUENCE) + 40,
    })

    expect(sequenceOf(useSequences.getState(), 'doc-1').selectedId).toBeNull()
    expect(selectedFilePaths(useSelection.getState())).toEqual(['Images/one.png'])
  })

  it('leaves the montage untouched while the hand drags across a clip', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    const before = clipsOf()
    const canvas = paint('hand')

    fireEvent.pointerDown(canvas, { clientX: 10, clientY: RULER_HEIGHT + 30 })
    fireEvent.pointerMove(canvas, { clientX: 90, clientY: RULER_HEIGHT + 30 })
    fireEvent.pointerUp(canvas, { clientX: 90, clientY: RULER_HEIGHT + 30 })

    expect(clipsOf()).toEqual(before)
  })

  /**
   * The cursor is the whole of the feedback a trim gets before it starts: nothing is dragged
   * yet, and the grips painted on the canvas say a clip has ends without saying they are live.
   */
  it('takes a resize cursor over a clip edge', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    const canvas = paint()

    fireEvent.pointerMove(canvas, { clientX: 1, clientY: RULER_HEIGHT + 30 })

    expect(canvas.style.cursor).toBe('ew-resize')
  })

  it('gives the cursor back over the body of a clip, which is dragged and not trimmed', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    const canvas = paint()

    fireEvent.pointerMove(canvas, { clientX: 1, clientY: RULER_HEIGHT + 30 })
    fireEvent.pointerMove(canvas, {
      clientX: Math.round(timeToX(500_000, viewOf())),
      clientY: RULER_HEIGHT + 30,
    })

    expect(canvas.style.cursor).toBe('')
  })

  it('drops the resize cursor when the pointer leaves, rather than carrying it off the canvas', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    const canvas = paint()

    fireEvent.pointerMove(canvas, { clientX: 1, clientY: RULER_HEIGHT + 30 })
    fireEvent.pointerLeave(canvas)

    expect(canvas.style.cursor).toBe('')
  })

  it('never asks under the hand, which moves the view whether or not it is over an edge', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    const canvas = paint('hand')

    fireEvent.pointerMove(canvas, { clientX: 1, clientY: RULER_HEIGHT + 30 })

    expect(canvas.style.cursor).toBe('')
    expect(canvas.className).toContain('cursor-grab')
  })

  // The blade cuts where it is pressed. A resize cursor there would promise a lengthening and
  // hand back a cut two frames from the end, plus a history entry to undo.
  it('never asks under the blade either, which cuts rather than trims', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    const canvas = paint('blade')

    fireEvent.pointerMove(canvas, { clientX: 1, clientY: RULER_HEIGHT + 30 })

    expect(canvas.style.cursor).toBe('')
  })

  /**
   * The gesture the whole lot exists for: lay an image down, pull its left end, decide how long
   * it stays on screen. The clip starts at two seconds so there is room to grow leftwards.
   */
  const pullLeftEdgeTo = (target: number): void => {
    const canvas = paint()
    const left = Math.round(timeToX(2_000_000, viewOf()))

    fireEvent.pointerDown(canvas, { clientX: left + 1, clientY: RULER_HEIGHT + 30 })
    fireEvent.pointerUp(canvas, {
      clientX: Math.round(timeToX(target, viewOf())),
      clientY: RULER_HEIGHT + 30,
    })
  }

  const layDown = (): void => {
    useSequences
      .getState()
      .runCommand('doc-1', addClip('V1', clipFixture('c', 2_000_000, 1_000_000, { assetId: 'a1' })))
  }

  it('lengthens a still by its left edge, which is how an image gets its time on screen', () => {
    useAssets.setState({ items: [asset({ id: 'a1', type: 'image', name: 'card.png' })] })
    layDown()

    pullLeftEdgeTo(1_000_000)

    expect(clipsOf()[0]).toMatchObject({ start: 1_000_000, duration: 2_000_000 })
  })

  // The strip takes every kind of asset, and a texture is as timeless as an image: reading the
  // type alone rather than `isTimeless` refused this pull on two of the three kinds of picture.
  it('lengthens a texture the same way, since a picture is a picture however it was made', () => {
    useAssets.setState({ items: [asset({ id: 'a1', type: 'image', name: 'brick.png' })] })
    layDown()

    pullLeftEdgeTo(1_000_000)

    expect(clipsOf()[0]).toMatchObject({ start: 1_000_000, duration: 2_000_000 })
  })

  /**
   * `mediaDuration` answers null for a still AND for an asset nobody has probed yet, so without
   * telling them apart this pull would succeed here too — and the clip would then ask for more
   * source than the rush holds, freezing its tail on a frame with the sound gone.
   */
  it('refuses the same pull on a rush nobody has probed, whose source starts somewhere', () => {
    useAssets.setState({ items: [asset({ id: 'a1', type: 'video', name: 'rush.mp4' })] })
    layDown()

    pullLeftEdgeTo(1_000_000)

    expect(clipsOf()[0]).toMatchObject({ start: 2_000_000, duration: 1_000_000 })
  })

  it('undoes the last edit from the keyboard', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))

    fireEvent.keyDown(paint(), { code: 'KeyZ', metaKey: true })

    expect(clipsOf()).toHaveLength(0)
  })
})
