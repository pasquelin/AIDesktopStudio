import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useMemo } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SCENE_SUBJECT_ID } from '@shared/domain/animation'
import { SECOND } from '@shared/domain/time'
import { animationRows } from '@/engines/scene/animationRows'
import { SUBJECT_HEIGHT } from '@/engines/timeline/bandRows'
import { meshNode, modelNodeFixture } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { addAnimationTrack } from '@/engines/scene/animationCommands'
import { animationViewOf, useAnimationViews } from '@/stores/animationView'
import { installScene } from '@/stores/scene-fixtures'
import { sceneHistoryOf, sceneOf, useScenes, writeAnimationTrack } from '@/stores/scenes'
import { useSceneViews } from '@/stores/sceneViews'
import { AnimationHeaders } from './AnimationHeaders'

const DOCUMENT = 'doc-1'

const timelineOf = () => sceneOf(useScenes.getState(), DOCUMENT).animation
const tracks = () => timelineOf().tracks

/** A cube with a position and a scale channel, which is what the panel adds. */
function withTwoChannels(): void {
  const base = { ...EMPTY_SCENE, nodes: [meshNode('cube-1')] }
  const one = addAnimationTrack({ nodeId: 'cube-1', property: 'position' }, 'Cube · Position', 't1')
  const two = addAnimationTrack({ nodeId: 'cube-1', property: 'scale' }, 'Cube · Scale', 't2')
  installScene(DOCUMENT, two.apply(one.apply(base)))
}

/** The cube is ON the band here — which is what these cases are about, never who put it there. */
const rowsOf = (expanded: string[] = []) =>
  animationRows(
    { ...timelineOf(), sheet: ['cube-1'] },
    { sceneName: 'Scene', nodes: [{ id: 'cube-1', name: 'Cube' }], expanded: new Set(expanded) },
  )

const headers = (expanded: string[] = []) => {
  cleanup()
  return render(<AnimationHeaders documentId={DOCUMENT} rows={rowsOf(expanded)} />)
}

const subject = () => within(screen.getByTestId('anim-subject-cube-1'))

describe('the column beside the band', () => {
  beforeEach(() => {
    withTwoChannels()
    useSceneViews.setState({ views: {} })
    useAnimationViews.setState({ views: {} })
  })

  it('shows the name of what it drives — the whole point of the column', () => {
    headers()
    expect(screen.getByTestId('anim-subject-cube-1')).toHaveTextContent('Cube')
  })

  /**
   * The name a screen reader announces for the list itself. `TimelineHeaderColumn` requires the
   * label, so an absent one does not compile — what nothing held is the label being the RIGHT
   * one: the montage column beside it is the same component with a different key, and a
   * copy-paste between the two reads as correct everywhere the compiler and the key guard look.
   */
  it('announces itself as the rows of the animation, not as the tracks of the montage', () => {
    headers()

    expect(screen.getByRole('list', { name: 'Lignes de l’animation' })).toBeInTheDocument()
  })

  it('names each channel once the subject is unfolded', () => {
    headers(['cube-1'])

    expect(screen.getByTestId('anim-channel-t1')).toHaveTextContent('Cube · Position')
    expect(screen.getByTestId('anim-channel-t2')).toHaveTextContent('Cube · Scale')
  })

  it('mutes every channel of a subject together, so a half-muted object cannot happen', async () => {
    headers()
    await userEvent.click(subject().getByRole('button', { name: /Rendre muette/ }))

    expect(tracks().map(track => track.muted)).toEqual([true, true])
  })

  it('turns a MIXED subject fully on rather than flipping each channel its own way', async () => {
    // One of the two already muted: pressing the subject switch must not leave them opposed.
    writeAnimationTrack(DOCUMENT, 't1', track => ({ ...track, muted: true }))
    headers()

    await userEvent.click(subject().getByRole('button', { name: /Rendre muette/ }))

    expect(tracks().map(track => track.muted)).toEqual([true, true])
  })

  it('keeps a switch off the undo stack: it is how one works, not what one made', async () => {
    headers()
    const before = sceneHistoryOf(useScenes.getState(), DOCUMENT).past.length

    await userEvent.click(subject().getByRole('button', { name: /Rendre muette/ }))

    expect(sceneHistoryOf(useScenes.getState(), DOCUMENT).past).toHaveLength(before)
  })

  it('keys the subject at the head, on every one of its channels', async () => {
    useSceneViews.getState().setPlayhead(DOCUMENT, 2 * SECOND)
    headers()

    await userEvent.click(subject().getByRole('button', { name: /Poser une clé sur Cube/ }))

    expect(tracks()[0]?.keys).toHaveLength(1)
    expect(tracks()[1]?.keys[0]?.time).toBe(2 * SECOND)
  })

  it('removes one channel and leaves the other, from the channel row', async () => {
    headers(['cube-1'])

    const row = within(screen.getByTestId('anim-channel-t1'))
    await userEvent.click(row.getByRole('button', { name: /Supprimer la piste/ }))

    expect(tracks().map(track => track.id)).toEqual(['t2'])
  })

  // On the band and holding nothing yet: the line is where the first key gets posed, so it has
  // to be there before there is anything on it. Who put it there is `animationRows`' own case.
  it('shows an object of the band even before it holds a single channel', () => {
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [meshNode('cube-1')] })
    headers()

    expect(screen.getByTestId('anim-subject-cube-1')).toHaveTextContent('Cube')
    expect(screen.queryByTestId('anim-channel-t1')).not.toBeInTheDocument()
  })

  // `[].every()` is `true`, so an object with no channel used to draw its three switches pressed
  // — muted, soloed and locked — while the montage beside it drew the same three flat and off.
  it('leaves the switches off on an object that holds no channel', () => {
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [meshNode('cube-1')] })
    headers()

    for (const name of [/Rendre muette/, /Écouter seule/, /Verrouiller/])
      expect(subject().getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('taking a key back off', () => {
  beforeEach(() => {
    withTwoChannels()
    useSceneViews.setState({ views: {} })
    useAnimationViews.setState({ views: {} })
  })

  const keyed = async (): Promise<void> => {
    await userEvent.click(subject().getByRole('button', { name: /Poser une clé sur/ }))
  }

  it('offers to remove where a key stands, having offered to pose where none did', async () => {
    headers()
    expect(subject().queryByRole('button', { name: /Retirer la clé/ })).not.toBeInTheDocument()

    await keyed()
    headers()

    expect(subject().getByRole('button', { name: /Retirer la clé/ })).toBeInTheDocument()
  })

  it('takes the key off every channel it was posed on', async () => {
    headers()
    await keyed()
    expect(tracks().every(track => track.keys.length === 1)).toBe(true)

    headers()
    await userEvent.click(subject().getByRole('button', { name: /Retirer la clé/ }))

    expect(tracks().every(track => track.keys.length === 0)).toBe(true)
  })

  it('costs ONE undo, like posing it did', async () => {
    headers()
    await keyed()
    const before = sceneHistoryOf(useScenes.getState(), DOCUMENT).past.length

    headers()
    await userEvent.click(subject().getByRole('button', { name: /Retirer la clé/ }))

    expect(sceneHistoryOf(useScenes.getState(), DOCUMENT).past).toHaveLength(before + 1)
  })

  it('leaves a key standing elsewhere alone', async () => {
    useSceneViews.getState().setPlayhead(DOCUMENT, 0)
    headers()
    await keyed()

    useSceneViews.getState().setPlayhead(DOCUMENT, 2 * SECOND)
    headers()
    await userEvent.click(subject().getByRole('button', { name: /Poser une clé sur/ }))

    // Two keys now; removing the one at two seconds must not touch the one at zero.
    headers()
    await userEvent.click(subject().getByRole('button', { name: /Retirer la clé/ }))

    expect(tracks()[0]?.keys.map(key => key.time)).toEqual([0])
  })
})

describe('arranging the lines', () => {
  const TWO = [
    { id: 'cube-1', name: 'Cube' },
    { id: 'cube-2', name: 'Sphere' },
  ]

  beforeEach(() => {
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [meshNode('cube-1'), meshNode('cube-2')] })
    useAnimationViews.setState({ views: {} })

    render(
      <AnimationHeaders
        documentId={DOCUMENT}
        rows={animationRows(
          { ...timelineOf(), sheet: TWO.map(node => node.id) },
          { sceneName: 'Scene', nodes: TWO, expanded: new Set() },
        )}
      />,
    )
  })

  const grip = (name: string) => screen.getByRole('button', { name: new RegExp(name) })
  const orderOf = () => animationViewOf(useAnimationViews.getState(), DOCUMENT).order

  it('records the whole arrangement, not the line that moved, so nothing falls behind it', async () => {
    grip('Déplacer la ligne Sphere').focus()
    await userEvent.keyboard('{ArrowUp}')

    expect(orderOf()).toEqual(['cube-2', 'cube-1'])
  })

  it('leaves the scene exactly as it was: the arrangement belongs to the sheet alone', async () => {
    grip('Déplacer la ligne Sphere').focus()
    await userEvent.keyboard('{ArrowUp}')

    expect(sceneOf(useScenes.getState(), DOCUMENT).nodes.map(node => node.id)).toEqual([
      'cube-1',
      'cube-2',
    ])
    expect(sceneHistoryOf(useScenes.getState(), DOCUMENT).past).toHaveLength(0)
  })
})

/**
 * The sheet's own drag, which the block above never exercised: it reorders from the KEYBOARD, one
 * press at a time, and a press moves nothing in the DOM that a pointer gesture has to survive.
 *
 * The rows are recomputed from the arrangement here, as `AnimationPanel` does — handed a frozen
 * array, a drag would read the same order at every step and prove nothing.
 */
describe('a line of the sheet dragged by its grip', () => {
  const THREE = [
    { id: 'cube-1', name: 'Cube' },
    { id: 'cube-2', name: 'Sphere' },
    { id: 'cube-3', name: 'Cone' },
  ]

  function Sheet() {
    const order = useAnimationViews(state => animationViewOf(state, DOCUMENT).order)
    const rows = useMemo(
      () =>
        animationRows(
          { ...timelineOf(), sheet: THREE.map(node => node.id) },
          { sceneName: 'Scene', nodes: THREE, expanded: new Set(), order },
        ),
      [order],
    )
    return <AnimationHeaders documentId={DOCUMENT} rows={rows} />
  }

  const shown = (): (string | undefined)[] =>
    screen
      .getAllByTestId(/^anim-subject-/)
      .map(node => node.getAttribute('data-testid')?.replace('anim-subject-', ''))

  beforeEach(() => {
    installScene(DOCUMENT, {
      ...EMPTY_SCENE,
      nodes: [meshNode('cube-1'), meshNode('cube-2'), meshNode('cube-3')],
    })
    useAnimationViews.setState({ views: {} })
    render(<Sheet />, { wrapper: StrictMode })
  })

  // Climbing crossed as many lines as the pointer did; descending stopped at the first.
  it('carries the top line all the way to the bottom of the sheet', () => {
    const height = SUBJECT_HEIGHT
    fireEvent.pointerDown(screen.getByRole('button', { name: /Déplacer la ligne Cube$/ }), {
      clientY: 0,
    })
    fireEvent.pointerMove(window, { clientY: height, buttons: 1 })
    fireEvent.pointerMove(window, { clientY: 2 * height, buttons: 1 })
    fireEvent.pointerUp(window)

    expect(shown()).toEqual(['cube-2', 'cube-3', 'cube-1'])
  })

  // Two moves reaching the handle before React has published the render between them: the sheet
  // used to answer from the order it was drawn with, bank a place the line never took, and
  // swallow the rest of the gesture in silence.
  it('answers from the arrangement it holds, not from the one it was drawn with', () => {
    fireEvent.pointerDown(screen.getByRole('button', { name: /Déplacer la ligne Cube$/ }), {
      clientY: 0,
    })
    act(() => {
      fireEvent.pointerMove(window, { clientY: SUBJECT_HEIGHT, buttons: 1 })
      fireEvent.pointerMove(window, { clientY: 2 * SUBJECT_HEIGHT, buttons: 1 })
    })
    fireEvent.pointerUp(window)

    expect(shown()).toEqual(['cube-2', 'cube-3', 'cube-1'])
  })

  /**
   * The sheet writes its scroll into ANOTHER store than the montage does, and into a nested field
   * — `animationViewOf(...).viewport`. The column is shared; the wiring on this side is not, and a
   * wrong field there would go through every gate green.
   */
  it('scrolls the sheet from the wheel over its own names', () => {
    const clip = screen.getByTestId('band-clip')
    const stack = clip.firstElementChild
    const column = clip.parentElement
    if (!(stack instanceof HTMLElement) || !column) throw new Error('the sheet has no column')

    Object.defineProperty(stack, 'offsetHeight', { configurable: true, value: 3 * SUBJECT_HEIGHT })
    Object.defineProperty(clip, 'clientHeight', { configurable: true, value: SUBJECT_HEIGHT })

    fireEvent.wheel(column, { deltaY: 10_000 })

    expect(animationViewOf(useAnimationViews.getState(), DOCUMENT).viewport.scrollTop).toBe(
      2 * SUBJECT_HEIGHT,
    )
  })
})

describe('the line of a sub-track', () => {
  beforeEach(() => {
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [modelNodeFixture('perso')] })
    useAnimationViews.setState({ views: {} })
  })

  const lanesOf = () => {
    const node = sceneOf(useScenes.getState(), DOCUMENT).nodes.find(one => one.id === 'perso')
    return node?.type === 'model' ? node.model.lanes : undefined
  }

  const showLanes = (...laneIds: string[]) => {
    cleanup()
    const rows = animationRows(
      { ...timelineOf(), sheet: ['perso'] },
      {
        sceneName: 'Scene',
        nodes: [{ id: 'perso', name: 'Perso' }],
        expanded: new Set(['perso']),
        lanes: laneIds.map(laneId => ({
          nodeId: 'perso',
          laneId,
          name: `Anim. ${laneId}`,
          blocks: [],
        })),
      },
    )
    return render(<AnimationHeaders documentId={DOCUMENT} rows={rows} />)
  }

  it('names each sub-track of an object apart, so two of them are told apart', () => {
    showLanes('1', '2')

    expect(screen.getByText('Anim. 1')).toBeTruthy()
    expect(screen.getByText('Anim. 2')).toBeTruthy()
  })

  // Adding is ONE action, so it belongs to one line: offered on every lane it read as a control
  // that meant something different on each.
  it('offers to add a sub-track on the last line alone', () => {
    showLanes('1', '2')

    expect(screen.getAllByRole('button', { name: 'Ajouter une sous-piste' })).toHaveLength(1)
  })

  it('adds a sub-track at the end of the stack', async () => {
    showLanes('main')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une sous-piste' }))

    expect(lanesOf()).toHaveLength(2)
  })

  // An object's track is where an animation is dropped: one with no lane left has nowhere to
  // receive the next.
  it('never takes the last sub-track away', async () => {
    showLanes('main')
    await userEvent.click(
      screen.getByRole('button', { name: 'Supprimer la sous-piste Anim. main' }),
    )

    expect(lanesOf()).toBeUndefined()
    expect(screen.getByText('Anim. main')).toBeTruthy()
  })

  it('offers a grip to move a sub-track through the stack', () => {
    showLanes('1', '2')

    expect(screen.getByRole('button', { name: 'Déplacer la ligne Anim. 1' })).toBeTruthy()
  })
})

/**
 * The scene's composition gets a line like any other subject, and it is the only one with no
 * pose behind it: its channels are opened one parameter at a time, from the composition panel.
 */
describe('the composition line', () => {
  beforeEach(() => {
    useSceneViews.setState({ views: {} })
    useAnimationViews.setState({ views: {} })
  })

  const compositionRows = (withChannel: boolean) => {
    const base = { ...EMPTY_SCENE, nodes: [meshNode('cube-1')] }
    const opened = withChannel
      ? addAnimationTrack(
          {
            nodeId: SCENE_SUBJECT_ID,
            property: 'post',
            post: { effectId: 'fx', param: 'strength' },
          },
          'Bloom · Strength',
          'post-1',
        ).apply(base)
      : base
    installScene(DOCUMENT, opened)

    return animationRows(
      { ...timelineOf(), sheet: [SCENE_SUBJECT_ID] },
      { sceneName: 'Composition', nodes: [], expanded: new Set() },
    )
  }

  const compositionLine = (withChannel: boolean) => {
    cleanup()
    render(<AnimationHeaders documentId={DOCUMENT} rows={compositionRows(withChannel)} />)
    return within(screen.getByTestId(`anim-subject-${SCENE_SUBJECT_ID}`))
  }

  it('names the line from the bundle rather than from a node', () => {
    expect(compositionLine(false).getByText('Composition')).toBeInTheDocument()
  })

  // The diamond stands for what the channels hold, so with none it stands for nothing at all.
  it('offers no key where the composition has no channel', () => {
    const diamond = compositionLine(false).getByRole('button', {
      name: /Poser une clé sur Composition/,
    })

    expect(diamond).toBeDisabled()
  })

  it('keys the composition channels that stand', async () => {
    const line = compositionLine(true)
    await userEvent.click(line.getByRole('button', { name: /Poser une clé sur Composition/ }))

    expect(tracks()[0]?.keys.map(key => key.time)).toEqual([0])
  })
})
