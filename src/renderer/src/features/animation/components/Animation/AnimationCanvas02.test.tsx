import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { clipLane, embeddedClip, type ClipRef } from '@shared/domain/scene'
import { SECOND } from '@shared/domain/time'
import { animationTrack, cameraShot, timelineWith } from '@/engines/scene/animation-fixtures'
import {
  addAnimationTrack,
  setAnimationKey,
  setTimelineSettings,
} from '@/engines/scene/animationCommands'
import { animationRows } from '@/engines/scene/animationRows'
import { SUBJECT_HEIGHT } from '@/engines/timeline/bandRows'
import { RULER_HEIGHT } from '@/engines/timeline/timelineGeometry'
import { cameraNodeFixture, meshNode, modelNodeFixture } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { animationViewOf, useAnimationViews } from '@/stores/animationView'
import { useModelFiles } from '@/stores/modelFiles'
import { installScene } from '@/stores/scene-fixtures'
import { sceneHistoryOf, sceneOf, useScenes } from '@/stores/scenes'
import { useSceneViews } from '@/stores/sceneViews'
import { AnimationCanvas } from './AnimationCanvas'

const DOCUMENT = 'doc-1'

/** One pixel per 10 ms, so a second is a hundred pixels across. */
const VIEWPORT = { scale: 100 / SECOND, offset: 0, scrollTop: 0 }

const key = (seconds: number) => ({ time: seconds * SECOND, value: { x: 0, y: 0, z: 0 } })

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

const keyRows = () =>
  animationRows(timelineWith([animationTrack('a', 'position', [key(1)])]), {
    sceneName: 'Scene',
    nodes: [{ id: 'cube', name: 'Circle' }],
    expanded: new Set(),
  })

describe('scrubbing and picking on the band', () => {
  beforeEach(() => {
    installScene(DOCUMENT, EMPTY_SCENE)
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

  const playhead = () => useSceneViews.getState().views[DOCUMENT]?.playhead

  it('moves the head when the ruler is pressed — the gesture nothing offered before', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={keyRows()} />)

    press(canvas(), 'pointerdown', 300, 4)

    expect(playhead()).toBe(3 * SECOND)
  })

  // Awaited, and that IS the behaviour: the head follows the pointer one frame at a time, never
  // once per pointermove — see the count below.
  it('keeps following the pointer while it is held down', async () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={keyRows()} />)

    press(canvas(), 'pointerdown', 100, 4)
    press(canvas(), 'pointermove', 400, 4)

    await waitFor(() => expect(playhead()).toBe(4 * SECOND))
  })

  /**
   * A pointermove is faster than a paint, and every subject row beside the band reads the head:
   * a scrub wrote it up to sixteen times a frame, for one line the eye can follow.
   */
  it('writes one head per frame while the pointer is dragged, not one per move', async () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={keyRows()} />)
    press(canvas(), 'pointerdown', 100, 4)

    let writes = 0
    const stop = useSceneViews.subscribe(() => {
      writes += 1
    })
    for (let move = 1; move <= 60; move += 1) press(canvas(), 'pointermove', 100 + move * 5, 4)

    expect(writes).toBe(0)
    // And the last position still lands: what a frame carries is the newest head, never none.
    await waitFor(() => expect(playhead()).toBe(4 * SECOND))
    stop()
  })

  it('holds the head inside the band rather than running past its end', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={keyRows()} />)

    // The band lasts five seconds; nine hundred pixels is nine.
    press(canvas(), 'pointerdown', 900, 4)

    expect(playhead()).toBe(5 * SECOND)
  })

  it('picks the key under the pointer', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={keyRows()} />)

    press(canvas(), 'pointerdown', 100, 48)

    expect(useAnimationViews.getState().views[DOCUMENT]?.selected).toEqual(['cube@1000000'])
  })

  it('lets go of the selection on a press that lands on nothing', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={keyRows()} />)
    press(canvas(), 'pointerdown', 100, 48)

    press(canvas(), 'pointerdown', 100, 4_000)

    expect(useAnimationViews.getState().views[DOCUMENT]?.selected).toEqual([])
  })
})

describe('following a duration that changes', () => {
  beforeEach(() => {
    installScene(DOCUMENT, EMPTY_SCENE)
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

  const playhead = () => useSceneViews.getState().views[DOCUMENT]?.playhead

  const lengthen = (seconds: number): void => {
    const store = useScenes.getState()
    store.runCommand(DOCUMENT, setTimelineSettings({ duration: seconds * SECOND }))
  }

  it('holds the head inside the band it had at the start', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={keyRows()} />)

    press(canvas(), 'pointerdown', 900, 4)
    expect(playhead()).toBe(5 * SECOND)
  })

  it('lets the head go further once the band is made longer', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={keyRows()} />)

    act(() => lengthen(20))
    press(canvas(), 'pointerdown', 900, 4)

    // Nine hundred pixels is nine seconds, which a twenty-second band holds.
    expect(playhead()).toBe(9 * SECOND)
  })

  it('pulls the head back in when the band is made shorter', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={keyRows()} />)
    act(() => lengthen(20))
    press(canvas(), 'pointerdown', 900, 4)

    act(() => lengthen(3))
    press(canvas(), 'pointerdown', 900, 4)

    expect(playhead()).toBe(3 * SECOND)
  })
})

describe('removing a picked key with the keyboard', () => {
  beforeEach(() => {
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [meshNode('cube')] })
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

  /** One channel holding two keys, at one and two seconds. */
  function keyedRows() {
    const state = useScenes.getState()
    const opened = addAnimationTrack({ nodeId: 'cube', property: 'position' }, 'Cube', 't1')
    act(() => state.runCommand(DOCUMENT, opened))
    act(() => state.runCommand(DOCUMENT, setAnimationKey('t1', 1 * SECOND, { x: 1, y: 0, z: 0 })))
    act(() => state.runCommand(DOCUMENT, setAnimationKey('t1', 2 * SECOND, { x: 2, y: 0, z: 0 })))

    return animationRows(sceneOf(useScenes.getState(), DOCUMENT).animation, {
      sceneName: 'Scene',
      nodes: [{ id: 'cube', name: 'Cube' }],
      expanded: new Set(),
    })
  }

  const keys = () => sceneOf(useScenes.getState(), DOCUMENT).animation.tracks[0]?.keys ?? []

  const press = (element: Element, key: string): void => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  }

  it('removes the key that was picked, and only it', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={keyedRows()} />)
    act(() => useAnimationViews.getState().setSelected(DOCUMENT, ['cube@1000000']))

    act(() => press(canvas(), 'Delete'))

    expect(keys().map(key => key.time)).toEqual([2 * SECOND])
  })

  it('answers Backspace too, which is what a Mac keyboard offers', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={keyedRows()} />)
    act(() => useAnimationViews.getState().setSelected(DOCUMENT, ['cube@2000000']))

    act(() => press(canvas(), 'Backspace'))

    expect(keys().map(key => key.time)).toEqual([1 * SECOND])
  })

  it('lets the selection go once the key it named is gone', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={keyedRows()} />)
    act(() => useAnimationViews.getState().setSelected(DOCUMENT, ['cube@1000000']))

    act(() => press(canvas(), 'Delete'))

    expect(useAnimationViews.getState().views[DOCUMENT]?.selected).toEqual([])
  })

  it('does nothing at all when no key is picked', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={keyedRows()} />)

    act(() => press(canvas(), 'Delete'))

    expect(keys()).toHaveLength(2)
  })
})

describe('dragging a shot', () => {
  const SHOT = cameraShot('s1', { cameraId: 'cam-a', start: 1 * SECOND, duration: 2 * SECOND })

  /** The vertical middle of the shot line, which the sheet draws above every subject. */
  const SHOT_MIDDLE = RULER_HEIGHT + SUBJECT_HEIGHT / 2

  beforeEach(() => {
    installScene(DOCUMENT, {
      ...EMPTY_SCENE,
      nodes: [cameraNodeFixture('cam-a')],
      animation: { ...EMPTY_SCENE.animation, shots: [SHOT] },
    })
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

  const shotRows = () =>
    animationRows(sceneOf(useScenes.getState(), DOCUMENT).animation, {
      sceneName: 'Scene',
      nodes: [{ id: 'cam-a', name: 'Camera A' }],
      expanded: new Set(),
    })

  const shotNow = () => sceneOf(useScenes.getState(), DOCUMENT).animation.shots[0]

  it('slides the bar, keeping where inside it the pointer took hold', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={shotRows()} />)

    // Grabbed half a second into a shot that starts at one second, dropped at three.
    act(() => press(canvas(), 'pointerdown', 150, SHOT_MIDDLE))
    act(() => press(canvas(), 'pointermove', 300, SHOT_MIDDLE))
    act(() => press(canvas(), 'pointerup', 300, SHOT_MIDDLE))

    expect(shotNow()).toMatchObject({ start: 2.5 * SECOND, duration: 2 * SECOND })
  })

  it('trims the tail by its edge, leaving the head where it stands', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={shotRows()} />)

    act(() => press(canvas(), 'pointerdown', 300, SHOT_MIDDLE))
    act(() => press(canvas(), 'pointermove', 500, SHOT_MIDDLE))
    act(() => press(canvas(), 'pointerup', 500, SHOT_MIDDLE))

    expect(shotNow()).toMatchObject({ start: 1 * SECOND, duration: 4 * SECOND })
  })

  /**
   * One set for everything the band holds picked, keys and shots alike — a shot answers to its
   * own id. A second store for the same question is how two selections stop agreeing.
   */
  it('picks a shot into the very set the keys are picked in', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={shotRows()} />)

    act(() => press(canvas(), 'pointerdown', 150, SHOT_MIDDLE))
    act(() => press(canvas(), 'pointerup', 150, SHOT_MIDDLE))

    expect(useAnimationViews.getState().views[DOCUMENT]?.selected).toEqual(['s1'])
  })

  /**
   * The promise the montage makes over a clip's edge, made here too: a bar that trims and never
   * says so is a bar nobody tries to trim.
   */
  it('promises a trim over an edge, and nothing over the body', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={shotRows()} />)

    act(() => press(canvas(), 'pointermove', 300, SHOT_MIDDLE))
    expect(canvas().style.cursor).toBe('ew-resize')

    act(() => press(canvas(), 'pointermove', 200, SHOT_MIDDLE))
    expect(canvas().style.cursor).toBe('')
  })

  // One entry however far the bar travelled: a drag that cost thirty ⌘Z would be unusable.
  it('costs one entry in the history', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={shotRows()} />)
    const before = sceneHistoryOf(useScenes.getState(), DOCUMENT).past.length

    act(() => press(canvas(), 'pointerdown', 150, SHOT_MIDDLE))
    act(() => press(canvas(), 'pointermove', 200, SHOT_MIDDLE))
    act(() => press(canvas(), 'pointermove', 300, SHOT_MIDDLE))
    act(() => press(canvas(), 'pointerup', 300, SHOT_MIDDLE))

    expect(sceneHistoryOf(useScenes.getState(), DOCUMENT).past.length).toBe(before + 1)
  })

  it('takes the picked shot away on Delete, and lets the pick go with it', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={shotRows()} />)
    act(() => press(canvas(), 'pointerdown', 150, SHOT_MIDDLE))
    act(() => press(canvas(), 'pointerup', 150, SHOT_MIDDLE))

    act(() =>
      canvas().dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })),
    )

    expect(sceneOf(useScenes.getState(), DOCUMENT).animation.shots).toEqual([])
    expect(useAnimationViews.getState().views[DOCUMENT]?.selected).toEqual([])
  })
})

describe('the three gestures a chosen block answers to', () => {
  beforeEach(() => {
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [modelWithClip()] })
    useModelFiles.getState().report(DOCUMENT, 'perso', ['Walk'], { Walk: 2 })
    useSceneViews.setState({ views: {} })
    useAnimationViews.setState({
      views: {
        [DOCUMENT]: {
          viewport: VIEWPORT,
          expanded: [],
          selected: [],
          pickedBlock: 'c1',
          autoKey: false,
          looping: false,
          openMotion: null,
          order: [],
        },
      },
    })
  })

  const blocks = () => {
    const node = sceneOf(useScenes.getState(), DOCUMENT).nodes[0]
    return node?.type === 'model' ? (node.model.lanes?.[0]?.clips ?? []) : []
  }

  const type = (key: string, held: { metaKey?: boolean } = {}): void => {
    canvas().dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, ...held }))
  }

  it('takes the chosen block off the band, and lets the pick go with it', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)

    act(() => type('Delete'))

    expect(blocks()).toEqual([])
    expect(animationViewOf(useAnimationViews.getState(), DOCUMENT).pickedBlock).toBeNull()
  })

  it('lays a copy of it end to end with the original', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)

    act(() => type('KeyD', { metaKey: true }))

    expect(blocks().map(clip => clip.start)).toEqual([1 * SECOND, 3 * SECOND])
  })

  it('cuts it in two where the head stands', () => {
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)
    act(() => useSceneViews.getState().setPlayhead(DOCUMENT, 2 * SECOND))

    act(() => type('KeyS'))

    expect(blocks().map(clip => [clip.start, clip.duration])).toEqual([
      [1 * SECOND, 1 * SECOND],
      [2 * SECOND, 1 * SECOND],
    ])
  })

  // The band answers Delete for keys as well, and a block is the one thing that carries several
  // of them: asking the block first is what keeps one key from being taken instead.
  it('leaves the keys alone when nothing is chosen on the band', () => {
    act(() => useAnimationViews.getState().setPickedBlock(DOCUMENT, null))
    render(<AnimationCanvas documentId={DOCUMENT} rows={blockRows()} />)

    act(() => type('Delete'))
    act(() => type('KeyS'))

    expect(blocks()).toHaveLength(1)
  })
})
