import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { addClip } from '@/engines/timeline/commands'
import { RULER_HEIGHT, xToTime, type Viewport } from '@/engines/timeline/timelineGeometry'
import { clipFixture } from '@/engines/timeline/timeline-fixtures'
import type { Clip } from '@/engines/timeline/timelineState'
import { snapToFrame } from '@/engines/timeline/timelineState'
import { fakeMenu } from '@/helpers/menu-fixtures'
import { publishCommand } from '@/services/commandBus'
import { installFakeBridge } from '@/services/fakeBridge'
import { installSequence } from '@/stores/sequence-fixtures'
import { useAssets } from '@/stores/assets'
import { useSelection } from '@/stores/selection'
import { sequenceOf, sequenceStore, useSequences } from '@/stores/sequences'
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

  it('cuts where the head is SEEN while the montage plays, not where the document left it', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clipFixture('clip-1', 0, 4_000_000)))
    usePlayback.setState({ running: { 'doc-1': true }, heads: { 'doc-1': 2_000_000 } })
    paint()

    act(() => publishCommand('sequence.split'))

    expect(clipsOf().map(held => held.start)).toEqual([0, 2_000_000])
  })

  it('splits a clip under the blade', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))

    fireEvent.pointerDown(paint('blade'), { clientX: 40, clientY: RULER_HEIGHT + 10 })

    expect(clipsOf()).toHaveLength(2)
  })

  /**
   * WHERE it cuts, which the count above cannot tell apart: the blade cuts under the pointer and
   * the `S` shortcut cuts at the playhead — two gestures, and the bar used to describe the wrong
   * one. The playhead is parked elsewhere, so a cut that drifted to it would show; and the click
   * lands off a frame boundary, so the expectation has to run the real sum rather than agree with
   * it by accident.
   */
  it('splits under the pointer, not at the playhead the shortcut uses', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    useSequences.getState().replace('doc-1', {
      ...sequenceOf(useSequences.getState(), 'doc-1'),
      playhead: 800_000,
    })

    fireEvent.pointerDown(paint('blade'), { clientX: 41, clientY: RULER_HEIGHT + 10 })

    const { settings } = sequenceOf(useSequences.getState(), 'doc-1')
    const [first] = clipsOf()
    expect(first?.duration).toBe(snapToFrame(xToTime(41, viewOf()), settings) - clip.start)
  })

  it('moves the playhead when the ruler is pressed', () => {
    fireEvent.pointerDown(paint(), { clientX: 300, clientY: 4 })
    expect(sequenceOf(useSequences.getState(), 'doc-1').playhead).toBe(3_000_000)
  })

  /** The frame owed when the tab closes is flushed on unmount, and `replace` is how a document
   * ARRIVES: unguarded it built this montage back for an id the project had handed back. */
  it('builds no montage back for a document dropped mid-scrub', () => {
    const view = render(<TimelineCanvas documentId="doc-1" tool="select" />)
    const canvas = view.container.querySelector('canvas')
    if (!canvas) throw new Error('the timeline renders no canvas')

    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 4 })
    fireEvent.pointerMove(canvas, { clientX: 300, clientY: 4 })
    act(() => useSequences.getState().drop('doc-1'))
    view.unmount()

    expect(sequenceStore.hasState(useSequences.getState(), 'doc-1')).toBe(false)
  })

  /** Left pending, the frame landed after the press that followed and rewrote the montage. */
  it('pays the frame its last move owed on the release', () => {
    const canvas = paint()

    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 4 })
    fireEvent.pointerMove(canvas, { clientX: 300, clientY: 4 })
    fireEvent.pointerUp(canvas, { clientX: 300, clientY: 4 })

    expect(sequenceOf(useSequences.getState(), 'doc-1').playhead).toBe(3_000_000)
  })

  it('splits whatever the playhead crosses, without asking for a selection first', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    useSequences.getState().replace('doc-1', {
      ...sequenceOf(useSequences.getState(), 'doc-1'),
      selectedId: null,
      playhead: 400_000,
    })

    fireEvent.keyDown(paint(), { code: 'KeyS' })

    expect(clipsOf()).toHaveLength(2)
  })

  it('zooms in and out around the middle of the strip', () => {
    const canvas = paint()
    const before = viewOf().scale

    fireEvent.keyDown(canvas, { code: 'Equal', metaKey: true })
    expect(viewOf().scale).toBeGreaterThan(before)

    fireEvent.keyDown(canvas, { code: 'Minus', metaKey: true })
    expect(viewOf().scale).toBeCloseTo(before)
  })

  it('sends the playhead to the start and to the end of the montage', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    const canvas = paint()

    fireEvent.keyDown(canvas, { code: 'End' })
    expect(sequenceOf(useSequences.getState(), 'doc-1').playhead).toBe(1_000_000)

    fireEvent.keyDown(canvas, { code: 'Home' })
    expect(sequenceOf(useSequences.getState(), 'doc-1').playhead).toBe(0)
  })

  /**
   * The playhead moves on its own while the transport runs, and nothing was following it: a
   * montage longer than the strip ran off the right edge within seconds, and what stayed on
   * screen was a still picture of a moment nobody was watching any more.
   */
})
