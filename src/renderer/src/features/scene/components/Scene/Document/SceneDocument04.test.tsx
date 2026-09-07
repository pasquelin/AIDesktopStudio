import { act, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { forgetReportedFailures } from '@/services/diagnostics'
import { fakeMenu } from '@/helpers/menu-fixtures'
import { installFakeBridge } from '@/services/fakeBridge'
import { addNode } from '@/engines/scene/commands'
import { meshNode, rigStateFixture } from '@/engines/scene/scene-fixtures'
import type { SceneNode } from '@/engines/scene/sceneState'
import { useAssets } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import { useSceneViews, sceneViewOf } from '@/stores/sceneViews'
import { clearScenes } from '@/stores/scene-fixtures'
import { sceneOf, selectIn, useScenes } from '@/stores/scenes'
import { useSettings } from '@/stores/settings'
import type { SceneRendererOptions } from '@/engines/scene/SceneRenderer'
import { bonesOfNode, clipsOfNode, rigOfNode, useModelFiles } from '@/stores/modelFiles'
import { IDENTITY_TRANSFORM } from '@/engines/scene/sceneState'
import { SceneDocument } from './SceneDocument'

const setDocumentTitle = vi.fn()

// Dockview owns the tabs and needs a layout engine; what matters here is what the space asks
// of it.
vi.mock('@/features/shell/components/dockviewApi', () => ({
  setDocumentTitle: (...args: unknown[]) => setDocumentTitle(...args),
}))

const setMode = vi.fn()
const frameSelection = vi.fn()
const configure = vi.fn()
const setSnapping = vi.fn()
const setSpace = vi.fn()
const setProjection = vi.fn()
const setDisplayModes = vi.fn()
const activePane = vi.fn(() => 0)
const setSkeletons = vi.fn()
const setIsolation = vi.fn()
const setPoseMode = vi.fn()
const setPickedBone = vi.fn()
const setPickedPathPoint = vi.fn()
const setQuadView = vi.fn()
const setPaneViews = vi.fn()
const setPlayhead = vi.fn()
const setPreview = vi.fn()
const refreshTextures = vi.fn()
/** Every engine built, so a test can fire the callbacks the real one would. */
const built = vi.hoisted((): SceneRendererOptions[] => [])
/** The engines themselves, for the one fact a case has to state rather than fire: the flight. */
const engines = vi.hoisted((): { flying: boolean }[] => [])
const viewFrom = vi.fn()
const setNavigating = vi.fn()
// At module scope like the others, so a test can make the encoding itself refuse: the exporters
// throw on a texture they cannot write, and that is the half no bridge failure stands in for.
const exportTo = vi.fn(() => Promise.resolve(new Uint8Array([103, 108, 84, 70])))

// jsdom has no WebGL context: the renderer is exercised by hand, not here. What this test
// covers is that the document wires the toolbar and the keyboard to the right calls.
vi.mock('@/engines/scene/SceneRenderer', () => ({
  SceneRenderer: class {
    constructor(options: unknown) {
      built.push(options as SceneRendererOptions)
      engines.push(this)
    }

    mount = vi.fn()
    unmount = vi.fn()
    apply = vi.fn()
    dispose = vi.fn()
    setMotion = vi.fn()
    setNavigating = setNavigating
    /** The right button, which no case here holds down — the two that need it set it themselves. */
    flying = false
    configure = configure
    setMode = setMode
    setSnapping = setSnapping
    setSpace = setSpace
    setProjection = setProjection
    setDisplayModes = setDisplayModes
    activePane = activePane
    setSkeletons = setSkeletons
    setIsolation = setIsolation
    setPoseMode = setPoseMode
    setPickedBone = setPickedBone
    setPickedPathPoint = setPickedPathPoint
    setCameraPreview = vi.fn()
    setQuadView = setQuadView
    setPaneViews = setPaneViews
    setPlayhead = setPlayhead
    setPreview = setPreview
    refreshTextures = refreshTextures
    refreshModels = vi.fn()
    viewFrom = viewFrom
    frameSelection = frameSelection
    exportTo = exportTo
  },
}))

const box = meshNode('box-1')

const moved = (x: number) => ({
  ...IDENTITY_TRANSFORM,
  position: { x, y: 0, z: 0 },
})

function nodesOf(documentId: string): SceneNode[] {
  return [...sceneOf(useScenes.getState(), documentId).nodes]
}

// Every block, not one of them: a describe that leaned on its neighbour's setup only passed
// because the store leaked, and `active` — which gates the whole keyboard — was one of the
// things it leaked.
beforeEach(() => {
  vi.clearAllMocks()
  built.length = 0
  useModelFiles.setState({ clips: {}, rigs: {} })
  // The export tests install a bridge; without this it would answer for the ones that follow.
  vi.unstubAllGlobals()
  // A report is said once per subject and the set lives at module scope: a second test on the
  // same pair would otherwise watch a channel that has already had its say.
  forgetReportedFailures()
  clearScenes()
  useSceneViews.setState({ views: {} })
  useSettings.setState({ settings: DEFAULT_SETTINGS })
  // The descriptor, not just the id: a document restores itself through its kind, and
  // `WithDocument` is what guarantees one exists before this component ever renders.
  useDocuments.setState({
    documents: {
      'doc-1': {
        id: 'doc-1',
        kind: 'scene',
        workspace: '3d',
        title: 'Set dressing',
        path: 'documents/Set dressing.gltf',
      },
    },
    activeId: 'doc-1',
  })
})

describe('SceneDocument and a picture edited elsewhere', () => {
  it('tells the engine to ask again for its maps when the shelf is re-read', () => {
    render(<SceneDocument documentId="doc-1" />)
    refreshTextures.mockClear()

    act(() => useAssets.setState({ items: [] }))

    expect(refreshTextures).toHaveBeenCalled()
  })

  it('hands the engine a way to read what the catalogue knows of a picture', () => {
    render(<SceneDocument documentId="doc-1" />)

    expect(built.at(-1)?.assetVersion?.('never-heard-of')).toBeUndefined()
  })
})

describe('SceneDocument and the timeline over the scene', () => {
  it('tells the engine where the head stands, and never the other way round', () => {
    render(<SceneDocument documentId="doc-1" />)
    // Inside `act`: the effect that pushes it runs on the render the store change causes.
    act(() => useSceneViews.getState().setPlayhead('doc-1', 1.5))

    expect(setPlayhead).toHaveBeenLastCalledWith(1.5)
  })

  /**
   * The transport lives HERE rather than in the timeline panel, which is a tool window one may
   * close: a character has to keep walking in the viewport with no band on screen. Nothing else
   * asserts it — remove the hook and every other test of the studio stays green.
   */
  it('runs the head itself, so closing the timeline panel never stops playback', async () => {
    render(<SceneDocument documentId="doc-1" />)
    act(() => useSceneViews.getState().setPlaying('doc-1', true))

    await waitFor(() =>
      expect(sceneViewOf(useSceneViews.getState(), 'doc-1').playhead).toBeGreaterThan(0),
    )
    act(() => useSceneViews.getState().setPlaying('doc-1', false))
  })

  it('reports the bones a model brought, so a track can name one', () => {
    render(<SceneDocument documentId="doc-1" />)
    const options = built.at(-1)
    options?.onRig?.('perso', rigStateFixture(['spine', 'arm.L']))

    expect(bonesOfNode(useModelFiles.getState(), 'doc-1', 'perso')).toEqual(['spine', 'arm.L'])
  })

  it('reports what the model turned out to be, which is what the inspector answers with', () => {
    render(<SceneDocument documentId="doc-1" />)
    const options = built.at(-1)
    options?.onRig?.('perso', rigStateFixture(['spine']))

    expect(rigOfNode(useModelFiles.getState(), 'doc-1', 'perso')?.status).toBe('skinnedMesh')
  })

  it('reports the clips too, and forgets both when the viewport goes', () => {
    const { unmount } = render(<SceneDocument documentId="doc-1" />)
    const options = built.at(-1)
    options?.onClips?.('perso', ['walk'], { walk: 2 })
    expect(clipsOfNode(useModelFiles.getState(), 'doc-1', 'perso')).toEqual(['walk'])

    // The names came out of files that viewport parsed; nothing outside it can answer for them.
    unmount()
    expect(clipsOfNode(useModelFiles.getState(), 'doc-1', 'perso')).toEqual([])
  })

  it('writes a plain move while auto-key is off', () => {
    useScenes.getState().runCommand('doc-1', addNode(box))
    render(<SceneDocument documentId="doc-1" />)

    built.at(-1)?.onTransform([{ id: 'box-1', transform: moved(3) }])

    expect(nodesOf('doc-1').find(node => node.id === 'box-1')?.transform.position.x).toBe(3)
  })
})

describe('SceneDocument and a node right-clicked in the viewport', () => {
  /**
   * What decides that a right-click WAS a click — brief, still, and no motion key held — lives in
   * the engine, which needs a WebGL context and a ray to exercise: it is checked on screen rather
   * than here. This covers the half a test can reach: the document raises the menu it reports.
   */
  it('raises the node menu the viewport reports, without a rename it could not open', async () => {
    const menu = fakeMenu()
    installFakeBridge({ menu: menu.bridge })
    useScenes.getState().runCommand('doc-1', addNode(box))
    render(<SceneDocument documentId="doc-1" />)

    built.at(-1)?.onContextMenu?.('box-1')

    await vi.waitFor(() => expect(menu.labels()).toContain('Supprimer'))
    expect(menu.labels()).not.toContain('Renommer l’objet')
  })

  /**
   * The outliner arms its row on pointer down; the right button of a viewport flies the camera,
   * so nothing has armed anything here. Without this the rows would act on whatever was selected
   * before — the menu deletes a selection, never the node it was raised on.
   */
  it('selects the node it was raised on', () => {
    useScenes.getState().runCommand('doc-1', addNode(box))
    render(<SceneDocument documentId="doc-1" />)

    built.at(-1)?.onContextMenu?.('box-1')

    expect(sceneOf(useScenes.getState(), 'doc-1').selectedIds).toEqual(['box-1'])
  })

  /**
   * The void is not nothing to say: it is where a scene GROWS. Before this, a right-click that
   * hit no node answered with no menu at all, and ⇧A was a key nothing on screen named.
   */
  it('offers what a scene can receive where the click hit no node', async () => {
    const menu = fakeMenu()
    installFakeBridge({ menu: menu.bridge })
    render(<SceneDocument documentId="doc-1" />)

    built.at(-1)?.onContextMenu?.(null)

    await vi.waitFor(() => expect(menu.labels()).toContain('Ajouter une maille'))
    expect(menu.labels()).not.toContain('Supprimer')
  })

  it('opens the same rows on the key that names them', async () => {
    const menu = fakeMenu()
    installFakeBridge({ menu: menu.bridge })
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{Shift>}{A}{/Shift}')

    await vi.waitFor(() => expect(menu.labels()).toContain('Ajouter une maille'))
  })

  /**
   * That key is also boost-strafe-left, and the held set cannot tell the two apart — Shift is
   * down either way. A native menu takes the focus with it, so the keyups that would end the
   * flight go to the menu and the boost stays held.
   */
  it('opens nothing on that key while the camera is flying', async () => {
    const menu = fakeMenu()
    installFakeBridge({ menu: menu.bridge })
    render(<SceneDocument documentId="doc-1" />)
    const engine = engines.at(-1)
    if (engine) engine.flying = true

    await userEvent.keyboard('{Shift>}{A}{/Shift}')

    expect(menu.raised).toEqual([])
  })

  // The rows are what a scene GAINS, so choosing one puts it there — the same door the bar uses.
  it('adds the kind whose row was chosen', async () => {
    const menu = fakeMenu()
    menu.picks('Cube')
    installFakeBridge({ menu: menu.bridge })
    render(<SceneDocument documentId="doc-1" />)

    built.at(-1)?.onContextMenu?.(null)

    // A default scene already holds its lights, so what this reads is what the menu ADDED.
    await vi.waitFor(() =>
      expect(
        sceneOf(useScenes.getState(), 'doc-1').nodes.filter(node => node.type === 'mesh'),
      ).toHaveLength(1),
    )
  })

  // The other half of the same rule: a right-click on one of six must not shrink it to one.
  it('leaves a selection the node already belongs to', () => {
    useScenes.getState().runCommand('doc-1', addNode(box))
    useScenes.getState().runCommand('doc-1', addNode(meshNode('box-2')))
    render(<SceneDocument documentId="doc-1" />)
    selectIn('doc-1', ['box-1', 'box-2'])

    built.at(-1)?.onContextMenu?.('box-1')

    expect(sceneOf(useScenes.getState(), 'doc-1').selectedIds).toEqual(['box-1', 'box-2'])
  })
})
