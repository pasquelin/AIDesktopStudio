import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { meshNode, modelNodeFixture, rigStateFixture } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { setTimelineSettings } from '@/engines/scene/animationCommands'
import { SECOND } from '@shared/domain/time'
import { installScene } from '@/stores/scene-fixtures'
import { useSceneViews } from '@/stores/sceneViews'
import { useAnimationViews } from '@/stores/animationView'
import { useModelFiles } from '@/stores/modelFiles'
import { sceneHistoryOf, sceneOf, useScenes } from '@/stores/scenes'
import { sceneNodeDrag } from '@/features/scene/components/dragged'
import { AnimationPanel } from './AnimationPanel'

const DOCUMENT = 'doc-1'

const timelineOf = () => sceneOf(useScenes.getState(), DOCUMENT).animation
const tracks = () => timelineOf().tracks

/** A scene with one cube, picked and ON the band — which is what the add buttons read. */
function withSelectedCube(): void {
  installScene(DOCUMENT, {
    ...EMPTY_SCENE,
    nodes: [meshNode('cube-1')],
    selectedIds: ['cube-1'],
    animation: { ...EMPTY_SCENE.animation, sheet: ['cube-1'] },
  })
}

/*
 * Dropping an object of the outliner onto the band. Both halves were found by hand, at the screen,
 * and neither showed as an error of any kind — a browser refuses a drop in silence.
 *
 * The PANEL takes the drop and not the canvas, because an empty band draws no canvas at all: the
 * empty state stands there instead, and that is precisely when a first object is dropped.
 *
 * And the effect has to be `move`: the outliner arms its rows with `effectAllowed = 'move'`, and
 * a drop asking for `copy` is refused by the platform with nothing happening.
 */
describe('an object dropped onto the band', () => {
  /** Armed through the CHANNEL itself, so the case cannot drift from how a row is really carried. */
  const carrying = (...nodeIds: string[]) => {
    const written = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: 'uninitialized',
      dropEffect: 'none',
      types: [] as string[],
      setData: (type: string, value: string) => {
        written.set(type, value)
        dataTransfer.types = [...written.keys()]
      },
      getData: (type: string) => written.get(type) ?? '',
    }
    sceneNodeDrag.start({ dataTransfer } as never, nodeIds)
    return dataTransfer
  }

  beforeEach(() => {
    installScene(DOCUMENT, {
      ...EMPTY_SCENE,
      nodes: [meshNode('cube-1'), meshNode('sphere-1')],
      selectedIds: [],
      animation: { ...EMPTY_SCENE.animation, sheet: [] },
    })
    useAnimationViews.setState({ views: {} })
  })

  it('lands on an EMPTY band, where no canvas is drawn to receive it', () => {
    const { container } = render(<AnimationPanel documentId={DOCUMENT} />)
    const panel = container.firstElementChild
    if (!panel) throw new Error('no panel')

    fireEvent.drop(panel, { dataTransfer: carrying('sphere-1') })

    expect(timelineOf().sheet).toEqual(['sphere-1'])
    expect(screen.getByTestId('anim-subject-sphere-1')).toBeInTheDocument()
  })

  // `copy` draws the `+` under the pointer, and a target may not ask for an effect its source
  // forbade — `move` alone left every surface that ADDS unable to say the drop would work.
  it('asks for copy, which is the cursor that says the drop will work', () => {
    const { container } = render(<AnimationPanel documentId={DOCUMENT} />)
    const panel = container.firstElementChild
    if (!panel) throw new Error('no panel')
    const carried = carrying('cube-1')

    fireEvent.dragOver(panel, { dataTransfer: carried })

    expect(carried.dropEffect).toBe('copy')
  })
})

describe('AnimationPanel', () => {
  beforeEach(() => {
    withSelectedCube()
    useSceneViews.setState({ views: {} })
    useAnimationViews.setState({ views: {} })
  })

  it('shows the object of the scene straight away, with nothing to create first', () => {
    render(<AnimationPanel documentId={DOCUMENT} />)

    expect(screen.getByTestId('anim-subject-cube-1')).toHaveTextContent('cube-1')
  })

  // 224 px of bordered nothing, on every band holding no block — the skeleton window's holds none.
  it('leaves out the settings column while no block is picked', () => {
    render(<AnimationPanel documentId={DOCUMENT} />)

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('offers no button to add a track, because there is nothing to add', () => {
    render(<AnimationPanel documentId={DOCUMENT} />)

    expect(screen.queryByRole('button', { name: /Ajouter une piste/ })).not.toBeInTheDocument()
  })

  it('keys an object that holds no channel yet, creating the three it needs', async () => {
    render(<AnimationPanel documentId={DOCUMENT} />)

    await userEvent.click(
      within(screen.getByTestId('anim-subject-cube-1')).getByRole('button', {
        name: /Poser une clé sur/,
      }),
    )

    expect(tracks().map(track => track.target.property)).toEqual(['position', 'rotation', 'scale'])
    expect(tracks().every(track => track.keys.length === 1)).toBe(true)
  })

  it('costs ONE undo for a key that had to open its channels', async () => {
    render(<AnimationPanel documentId={DOCUMENT} />)
    const before = sceneHistoryOf(useScenes.getState(), DOCUMENT).past.length

    await userEvent.click(
      within(screen.getByTestId('anim-subject-cube-1')).getByRole('button', {
        name: /Poser une clé sur/,
      }),
    )

    expect(sceneHistoryOf(useScenes.getState(), DOCUMENT).past).toHaveLength(before + 1)
  })

  it('keys a scale at one, not zero — a neutral key must not flatten the object', async () => {
    render(<AnimationPanel documentId={DOCUMENT} />)

    await userEvent.click(
      within(screen.getByTestId('anim-subject-cube-1')).getByRole('button', {
        name: /Poser une clé sur/,
      }),
    )

    const scale = tracks().find(track => track.target.property === 'scale')
    expect(scale?.keys[0]?.value).toEqual({ x: 1, y: 1, z: 1 })
  })

  it('unfolds the channels once they exist, and folds them back', async () => {
    render(<AnimationPanel documentId={DOCUMENT} />)
    await userEvent.click(
      within(screen.getByTestId('anim-subject-cube-1')).getByRole('button', {
        name: /Poser une clé sur/,
      }),
    )

    const fold = () =>
      within(screen.getByTestId('anim-subject-cube-1')).getByRole('button', { name: 'cube-1' })
    const channel = () => screen.queryByTestId('anim-channel-' + (tracks()[0]?.id ?? ''))

    await userEvent.click(fold())
    expect(channel()).toBeInTheDocument()

    await userEvent.click(fold())
    expect(channel()).not.toBeInTheDocument()
  })
})

describe('AnimationPanel and the bones of a rig', () => {
  beforeEach(() => {
    installScene(DOCUMENT, {
      ...EMPTY_SCENE,
      nodes: [modelNodeFixture('perso')],
      selectedIds: ['perso'],
      animation: { ...EMPTY_SCENE.animation, sheet: ['perso'] },
    })
    useSceneViews.setState({ views: {} })
    useModelFiles.setState({ clips: {}, rigs: {} })
  })

  it('keys the model itself, on its own line', async () => {
    useModelFiles.setState({ rigs: { [DOCUMENT]: { perso: rigStateFixture(['spine', 'arm.L']) } } })
    render(<AnimationPanel documentId={DOCUMENT} />)

    await userEvent.click(
      within(screen.getByTestId('anim-subject-perso')).getByRole('button', {
        name: /Poser une clé sur/,
      }),
    )

    expect(tracks().map(track => track.target)).toEqual([
      { nodeId: 'perso', property: 'position' },
      { nodeId: 'perso', property: 'rotation' },
      { nodeId: 'perso', property: 'scale' },
    ])
  })
})

describe('a head left outside the band', () => {
  beforeEach(() => {
    withSelectedCube()
    useSceneViews.setState({ views: {} })
    useAnimationViews.setState({ views: {} })
  })

  const shorten = (seconds: number): void => {
    useScenes.getState().runCommand(DOCUMENT, setTimelineSettings({ duration: seconds * SECOND }))
  }

  it('is pulled back in when the band is shortened under it', () => {
    useSceneViews.getState().setPlayhead(DOCUMENT, 4 * SECOND)
    render(<AnimationPanel documentId={DOCUMENT} />)

    act(() => shorten(2))

    // Left at four, the head would stand where no key can, and Play would stop on the frame it
    // starts on — the very defect the rewind was added to close.
    expect(useSceneViews.getState().views[DOCUMENT]?.playhead).toBe(2 * SECOND)
  })

  it('leaves a head that already fits exactly where it is', () => {
    useSceneViews.getState().setPlayhead(DOCUMENT, 1 * SECOND)
    render(<AnimationPanel documentId={DOCUMENT} />)

    act(() => shorten(3))

    expect(useSceneViews.getState().views[DOCUMENT]?.playhead).toBe(1 * SECOND)
  })
})

describe('the request, clause by clause', () => {
  beforeEach(() => {
    withSelectedCube()
    useSceneViews.setState({ views: {} })
    useAnimationViews.setState({ views: {} })
  })

  /*
   * The clause CHANGED, and this case changed with it: the band used to show every object of the
   * scene, which put 8 000 blocks and 24 009 buttons on it. A house is scenery and a character in
   * front of it is animated — only the person can say which, so only what they put there shows.
   */
  it('« ce que j’y mets » — the objects of the sheet have a line, the others none', () => {
    installScene(DOCUMENT, {
      ...EMPTY_SCENE,
      nodes: [meshNode('cube-1'), meshNode('sphere-1')],
      selectedIds: [],
      animation: { ...EMPTY_SCENE.animation, sheet: ['cube-1'] },
    })
    render(<AnimationPanel documentId={DOCUMENT} />)

    expect(screen.getByTestId('anim-subject-cube-1')).toBeInTheDocument()
    expect(screen.queryByTestId('anim-subject-sphere-1')).not.toBeInTheDocument()
  })

  it('« mettre des points clés » — one press keys the object, whatever it held before', async () => {
    render(<AnimationPanel documentId={DOCUMENT} />)

    await userEvent.click(
      within(screen.getByTestId('anim-subject-cube-1')).getByRole('button', {
        name: /Poser une clé sur/,
      }),
    )

    expect(tracks()).toHaveLength(3)
    expect(tracks().every(track => track.keys.length === 1)).toBe(true)
  })

  it('nothing asks to CREATE anything before the objects can be seen', () => {
    render(<AnimationPanel documentId={DOCUMENT} />)

    expect(screen.queryByRole('button', { name: /Ajouter une piste/ })).not.toBeInTheDocument()
    // And the word the montage uses has no place here: an object of a scene exists already.
    expect(screen.queryByText(/Aucune piste/)).not.toBeInTheDocument()
  })
})
