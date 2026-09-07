import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { addClip } from '@/engines/timeline/commands'
import { RULER_HEIGHT, type Viewport } from '@/engines/timeline/timelineGeometry'
import { clipFixture } from '@/engines/timeline/timeline-fixtures'
import type { Clip } from '@/engines/timeline/timelineState'
import { fakeMenu } from '@/helpers/menu-fixtures'
import { installFakeBridge } from '@/services/fakeBridge'
import { installSequence } from '@/stores/sequence-fixtures'
import { useAssets } from '@/stores/assets'
import { useSelection } from '@/stores/selection'
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

/**
 * A canvas that can paint, which is the only condition under which the strip ever learns its
 * own width — `testSetup` sizes every element but hands back a null 2D context, so `paint`
 * returns before measuring anything.
 *
 * Every drawing call is a no-op: nothing is asserted on what was drawn, only on what the
 * component did with the width it read back.
 */
function laidOut(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const context = new Proxy({} as CanvasRenderingContext2D, {
    get: () => () => undefined,
    set: () => true,
  })
  // One `as`, and the reason is the signature rather than the value: `getContext` is overloaded,
  // and a spy takes its LAST overload — the WebGPU one — so a 2D context reads as the wrong type.
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as GPUCanvasContext)
  return canvas
}

/**
 * Moves the playhead the way the transport does: a replace, outside the history. Inside `act`,
 * since nothing about it comes from an event — the effects it wakes must have run when it
 * hands back.
 */
function movePlayhead(playhead: number): void {
  act(() => {
    const store = useSequences.getState()
    store.replace('doc-1', { ...sequenceOf(store, 'doc-1'), playhead })
  })
}

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

  it('scrolls the strip after a playhead that has left the frame', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clipFixture('c', 0, 600_000_000)))
    laidOut(paint())
    expect(viewOf().offset).toBe(0)

    movePlayhead(500_000_000)

    expect(viewOf().offset).toBeGreaterThan(0)
  })

  /**
   * A montage offered nothing at all to a right-click: every edit was a key, so whoever had not
   * learnt them had no way to cut, unlink or delete a clip.
   */
  it('offers what can be done to the clip under the pointer', async () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))

    fireEvent.contextMenu(paint(), { clientX: 50, clientY: RULER_HEIGHT + 10 })

    await vi.waitFor(() =>
      expect(menu.labels()).toEqual([
        'Couper le clip',
        'Délier l’image et le son',
        'Supprimer le clip',
      ]),
    )
    // Greyed rather than dropped, so the menu keeps the same shape whatever it is opened over:
    // this clip is tied to nothing, and the playhead sits on its very start.
    expect(menu.offers('Délier l’image et le son')).toBe(false)
    expect(menu.offers('Couper le clip')).toBe(false)
  })

  it('runs the row that was chosen on the clip it was opened over', async () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    menu.picks('Supprimer le clip')

    fireEvent.contextMenu(paint(), { clientX: 50, clientY: RULER_HEIGHT + 10 })

    await vi.waitFor(() => expect(clipsOf()).toHaveLength(0))
  })

  /**
   * `pointerdown` fires before `contextmenu`, so the press that raises the menu was also
   * picking the clip up: it followed the pointer while the menu was open, and the drag's own
   * pointer-up rewound the montage to where the press began — over the deletion the menu had
   * just run. On screen: the clip slid, and nothing was deleted.
   */
  it('deletes from the menu without the press underneath moving anything', async () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    menu.picks('Supprimer le clip')
    const canvas = paint()

    fireEvent.pointerDown(canvas, { clientX: 50, clientY: RULER_HEIGHT + 10, button: 2 })
    fireEvent.contextMenu(canvas, { clientX: 50, clientY: RULER_HEIGHT + 10 })
    await vi.waitFor(() => expect(clipsOf()).toHaveLength(0))

    // The pointer travels on, as it does while a native menu is open and after it closes.
    fireEvent.pointerMove(canvas, { clientX: 300, clientY: RULER_HEIGHT + 10 })
    fireEvent.pointerUp(canvas, { clientX: 300, clientY: RULER_HEIGHT + 10 })

    expect(clipsOf()).toHaveLength(0)
  })

  /**
   * A Mac's main keyboard has one key marked « delete », and it reports `Backspace` — the
   * binding says `Delete`, which is that keyboard's `fn`-delete. Pressing the key that says
   * delete did nothing at all.
   */
  it('deletes the selected clip from the key that says delete', () => {
    useSequences.getState().runCommand('doc-1', addClip('V1', clip))
    const canvas = paint()

    fireEvent.keyDown(canvas, { code: 'Backspace' })

    expect(clipsOf()).toHaveLength(0)
  })

  /**
   * Every edit here is undoable and always was, but nothing said so and nothing held it: the
   * key travels through the native Edit menu, which declares it WITHOUT reserving it, and a
   * regression there would leave the montage looking like an editor with no way back.
   */
})
