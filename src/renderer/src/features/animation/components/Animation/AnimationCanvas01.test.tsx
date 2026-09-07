import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { clipLane, embeddedClip, type ClipRef } from '@shared/domain/scene'
import { SECOND } from '@shared/domain/time'
import { timelineWith } from '@/engines/scene/animation-fixtures'
import { animationRows } from '@/engines/scene/animationRows'
import { CHANNEL_HEIGHT, SUBJECT_HEIGHT } from '@/engines/timeline/bandRows'
import { RULER_HEIGHT } from '@/engines/timeline/timelineGeometry'
import { modelNodeFixture } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { ANIMATION_DRAG_TYPE } from '@/features/animation/components/dragged'
import { ASSET_DRAG_TYPE } from '@/helpers/assetDrag'
import { useAssets } from '@/stores/assets'
import { animationViewOf, useAnimationViews } from '@/stores/animationView'
import { useModelFiles } from '@/stores/modelFiles'
import { installScene } from '@/stores/scene-fixtures'
import { sceneHistoryOf, sceneOf, useScenes } from '@/stores/scenes'
import { useSceneViews } from '@/stores/sceneViews'
import { AnimationCanvas } from './AnimationCanvas'

const DOCUMENT = 'doc-1'

/** One pixel per 10 ms, so a second is a hundred pixels across. */
const VIEWPORT = { scale: 100 / SECOND, offset: 0, scrollTop: 0 }

const canvas = () => screen.getByTestId('animation-canvas')

/**
 * A pointer event on the canvas. jsdom lays nothing out, so the bounding box is all zeros and a
 * client coordinate IS the canvas coordinate — which is what makes the arithmetic readable here.
 */
function press(element: Element, type: string, x: number, y: number, buttons = 1): void {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, buttons })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  element.dispatchEvent(event)
}

const walkBlock: ClipRef = embeddedClip('c1', 'Walk', { start: 1 * SECOND })

const modelWithClip = () => {
  const node = modelNodeFixture('perso')
  return { ...node, model: { ...node.model, lanes: [clipLane('main', [walkBlock])] } }
}

const blockRows = () =>
  animationRows(timelineWith([], { sheet: ['perso'] }), {
    sceneName: 'Scene',
    nodes: [{ id: 'perso', name: 'Perso' }],
    expanded: new Set(['perso']),
    lanes: [
      {
        nodeId: 'perso',
        laneId: 'main',
        name: 'Animation 1',
        blocks: [{ clipId: 'c1', name: 'Walk', start: 1 * SECOND, duration: 2 * SECOND }],
      },
    ],
  })

/** The vertical middle of the lane row, which sits under the object's own line. */
const LANE_Y = RULER_HEIGHT + SUBJECT_HEIGHT + CHANNEL_HEIGHT / 2

describe('dragging a clip block', () => {
  beforeEach(() => {
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [modelWithClip()] })
    // How long the clip runs in the file, which only the engine knows and a trim is measured
    // against: without it a block has no width and every trim is refused.
    useModelFiles.getState().report(DOCUMENT, 'perso', ['Walk'], { Walk: 2 })
    useSceneViews.setState({ views: {} })
    useAnimationViews.setState({
      views: {
        [DOCUMENT]: {
          viewport: VIEWPORT,
          expanded: [],
          selected: [],
          pickedBlock: null,
          autoKey: false,
          looping: false,
          openMotion: null,
          order: [],
        },
      },
    })
  })

  const laneOf = () => {
    const node = sceneOf(useScenes.getState(), DOCUMENT).nodes[0]
    return node?.type === 'model' ? (node.model.lanes?.[0] ?? null) : null
  }

  const blockOf = (): ClipRef | null => laneOf()?.clips[0] ?? null

  const startOf = (): number => blockOf()?.start ?? -1

  it('slides the block, keeping where inside it the pointer took hold', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)

    // Grabbed half a second into a block that starts at one second, dropped at three.
    press(canvas(), 'pointerdown', 150, LANE_Y)
    press(canvas(), 'pointermove', 300, LANE_Y)

    expect(startOf()).toBe(2.5 * SECOND)
  })

  it('costs ONE undo entry however many pixels the drag crossed', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)
    const before = sceneHistoryOf(useScenes.getState(), DOCUMENT).past.length

    press(canvas(), 'pointerdown', 150, LANE_Y)
    for (const x of [200, 250, 300, 350, 400]) press(canvas(), 'pointermove', x, LANE_Y)
    press(canvas(), 'pointerup', 400, LANE_Y)

    expect(sceneHistoryOf(useScenes.getState(), DOCUMENT).past).toHaveLength(before + 1)
  })

  it('opens a second entry for a second drag, rather than swallowing it into the first', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)
    const before = sceneHistoryOf(useScenes.getState(), DOCUMENT).past.length

    press(canvas(), 'pointerdown', 150, LANE_Y)
    press(canvas(), 'pointermove', 300, LANE_Y)
    press(canvas(), 'pointerup', 300, LANE_Y)

    press(canvas(), 'pointerdown', 300, LANE_Y)
    press(canvas(), 'pointermove', 500, LANE_Y)
    press(canvas(), 'pointerup', 500, LANE_Y)

    expect(sceneHistoryOf(useScenes.getState(), DOCUMENT).past).toHaveLength(before + 2)
  })

  /** Dropping an animation from the panel, as the browser hands it over. */
  function drop(element: Element, payload: unknown, x: number, y: number): void {
    const event = new MouseEvent('drop', {
      bubbles: true,
      clientX: x,
      clientY: y,
      cancelable: true,
    })
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        // `types` as a real one always carries it: a target asks what is FLYING before the drop,
        // and a double without it answers nothing where the platform would answer.
        types: [ANIMATION_DRAG_TYPE],
        getData: (type: string) => (type === ANIMATION_DRAG_TYPE ? JSON.stringify(payload) : ''),
      },
    })
    element.dispatchEvent(event)
  }

  // The only gesture that puts a SECOND block on a lane: without it a model could hold one clip
  // and neither "one after another" nor "both at once" was reachable.
  it('lays a block where an animation is dropped, on the lane it lands on', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)

    drop(canvas(), { kind: 'embedded', clip: 'Walk' }, 400, LANE_Y)

    const clips = laneOf()?.clips ?? []
    expect(clips).toHaveLength(2)
    expect(clips[1]?.start).toBe(4 * SECOND)
    expect(clips[1]?.source.name).toBe('Walk')
  })

  // The panel offers both kinds and only the drop tells them apart: a shipped animation is
  // written into the document as a NAME, and read off disk on the other side of the frontier.
  it('lays a shipped animation as a block of its own kind, labelled by its folder', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)

    drop(canvas(), { kind: 'bundled', name: 'Capoeira' }, 400, LANE_Y)

    const laid = laneOf()?.clips[1]
    expect(laid?.source).toEqual({ kind: 'bundled', name: 'Capoeira' })
    expect(laid?.label).toBe('Capoeira')
  })

  // A `dataTransfer` carries text, and this one used to be read by looking for a `clip` field:
  // anything else laid a block naming `undefined`, which nothing could ever play.
  it('lays nothing for a payload that is neither of the two shapes', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)

    drop(canvas(), { kind: 'bundled', path: '/somewhere/walk.glb' }, 400, LANE_Y)

    expect(laneOf()?.clips).toHaveLength(1)
  })

  /** Dropping a model of the project onto a lane, as the asset browser hands it over. */
  function dropAsset(element: Element, id: string, x: number, y: number): void {
    const event = new MouseEvent('drop', { bubbles: true, clientX: x, clientY: y })
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        types: [ASSET_DRAG_TYPE, `${ASSET_DRAG_TYPE}+mesh`],
        getData: (type: string) => (type === ASSET_DRAG_TYPE ? id : ''),
      },
    })
    element.dispatchEvent(event)
  }

  // Case 6 of the issue: a file the project holds, dropped for the motion inside it. The mesh it
  // also carries is the engine's business to leave alone; the block only ever names the asset.
  it('lays a block on a model of the project dropped onto a lane', async () => {
    useAssets.setState({
      items: [
        {
          id: 'asset-9',
          name: 'jig',
          type: 'mesh',
          location: 'local',
          tags: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)

    await act(async () => dropAsset(canvas(), 'asset-9', 400, LANE_Y))

    const laid = laneOf()?.clips[1]
    expect(laid?.source).toEqual({ kind: 'asset', assetId: 'asset-9', name: 'jig' })
    // Its own name, never what the clip inside spells — `NlaTrack` is what Tripo writes.
    expect(laid?.label).toBe('jig')
    expect(laid?.start).toBe(4 * SECOND)
  })

  it('lays nothing for a model the catalogue has never heard of', async () => {
    useAssets.setState({ items: [] })
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)

    await act(async () => dropAsset(canvas(), 'asset-9', 400, LANE_Y))

    expect(laneOf()?.clips).toHaveLength(1)
  })

  it('makes the block one just dropped the chosen one', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)

    drop(canvas(), { kind: 'embedded', clip: 'Walk' }, 400, LANE_Y)

    const laid = laneOf()?.clips[1]
    expect(animationViewOf(useAnimationViews.getState(), DOCUMENT).pickedBlock).toBe(laid?.id)
  })

  it('lays nothing when the drop lands on a channel or on the ruler', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)

    drop(canvas(), { kind: 'embedded', clip: 'Walk' }, 400, 4)

    expect(laneOf()?.clips).toHaveLength(1)
  })

  it('shows the block one presses as the chosen one, and drops the picked keys', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)
    useAnimationViews.getState().setSelected(DOCUMENT, ['a@0'])

    press(canvas(), 'pointerdown', 150, LANE_Y)

    const view = animationViewOf(useAnimationViews.getState(), DOCUMENT)
    expect(view.pickedBlock).toBe('c1')
    expect(view.selected).toEqual([])
  })

  // Dragged past the end, a block would sit where the head never goes: the head is clamped to the
  // duration, so its last frames could show a pose nothing can reach.
  it('never slides a block past the end of the band', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)

    press(canvas(), 'pointerdown', 150, LANE_Y)
    press(canvas(), 'pointermove', 9000, LANE_Y)

    expect(startOf()).toBeLessThanOrEqual(5 * SECOND)
  })

  it('never slides a block before the start of the band', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)

    press(canvas(), 'pointerdown', 150, LANE_Y)
    press(canvas(), 'pointermove', -900, LANE_Y)

    expect(startOf()).toBe(0)
  })

  // Pressed at the block's own end rather than in its body: this is the gesture that read as a
  // move that did not work, because nothing said the pointer was over a trim zone.
  it('lengthens the block by its end rather than sliding it', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)

    press(canvas(), 'pointerdown', 299, LANE_Y)
    press(canvas(), 'pointermove', 400, LANE_Y)

    expect(startOf()).toBe(1 * SECOND)
    expect(blockOf()?.duration).toBe(3 * SECOND)
  })

  // A pointerup lost off the window used to leave the gesture open, and the next edit of the same
  // node coalesced into it: one ⌘Z undid two drags.
  it('closes the gesture on a move with no button held', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)
    const before = sceneHistoryOf(useScenes.getState(), DOCUMENT).past.length

    press(canvas(), 'pointerdown', 150, LANE_Y)
    press(canvas(), 'pointermove', 300, LANE_Y)
    press(canvas(), 'pointermove', 300, LANE_Y, 0)

    press(canvas(), 'pointerdown', 300, LANE_Y)
    press(canvas(), 'pointermove', 500, LANE_Y)
    press(canvas(), 'pointerup', 500, LANE_Y)

    expect(sceneHistoryOf(useScenes.getState(), DOCUMENT).past).toHaveLength(before + 2)
  })
})
