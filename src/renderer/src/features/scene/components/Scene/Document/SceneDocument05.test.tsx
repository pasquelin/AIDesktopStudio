import { act, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { forgetReportedFailures } from '@/services/diagnostics'
import { addNode } from '@/engines/scene/commands'
import { meshNode, pathNodeFixture } from '@/engines/scene/scene-fixtures'
import type { SceneNode } from '@/engines/scene/sceneState'
import { useDocuments } from '@/stores/documents'
import { useSceneViews, sceneViewOf } from '@/stores/sceneViews'
import { clearScenes } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { useSettings } from '@/stores/settings'
import type { SceneRendererOptions } from '@/engines/scene/SceneRenderer'
import { useModelFiles } from '@/stores/modelFiles'
import { DEFAULT_PATH, type GeometryDescriptor } from '@shared/domain/scene'
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
    viewFrom = viewFrom
    frameSelection = frameSelection
    exportTo = exportTo
  },
}))

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

describe('SceneDocument and the pose mode', () => {
  it('turns the pose mode on with the bound key, and back off', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{p}')
    expect(setPoseMode).toHaveBeenLastCalledWith(true)

    await userEvent.keyboard('{p}')
    expect(setPoseMode).toHaveBeenLastCalledWith(false)
  })

  it('holds the bone the viewport picked, so the gizmo can aim at it', async () => {
    render(<SceneDocument documentId="doc-1" />)
    await userEvent.keyboard('{p}')

    await act(async () => built.at(-1)?.onSelectBone?.({ nodeId: 'perso', bone: 'Arm.L' }))

    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').pickedBone).toEqual({
      nodeId: 'perso',
      bone: 'Arm.L',
    })
  })

  it('lets go of the bone when the mode is left, so nothing keeps holding it', async () => {
    render(<SceneDocument documentId="doc-1" />)
    await userEvent.keyboard('{p}')
    await act(async () => built.at(-1)?.onSelectBone?.({ nodeId: 'perso', bone: 'Arm.L' }))

    await userEvent.keyboard('{p}')

    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').pickedBone).toBeNull()
    expect(setPickedBone).toHaveBeenLastCalledWith(null)
  })
})

describe('SceneDocument and a point posed on a rail', () => {
  const at = (x: number) => ({ x, y: 0, z: 0 })

  const pointsOf = (): number[] => {
    const node = nodesOf('doc-1').find(candidate => candidate.id === 'rail')
    return node?.type === 'path' ? node.path.points.map(point => point.x) : []
  }

  const installRail = (): void => {
    act(() =>
      useScenes
        .getState()
        .runCommand('doc-1', addNode(pathNodeFixture('rail', { points: [at(0), at(10), at(20)] }))),
    )
  }

  it('poses the point in the stretch the viewport names, and nowhere else', async () => {
    render(<SceneDocument documentId="doc-1" />)
    installRail()

    await act(async () => built.at(-1)?.onAddPathPoint?.('rail', 0))

    expect(pointsOf()).toEqual([0, 5, 10, 20])
  })

  /**
   * Picked on the way, so the point one just made is the point one drags: nothing on screen says
   * the gesture is in two steps, and a knob posed and left unheld would be that second step.
   */
  it('picks the point it just posed', async () => {
    render(<SceneDocument documentId="doc-1" />)
    installRail()

    await act(async () => built.at(-1)?.onAddPathPoint?.('rail', 0))

    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').pickedPathPoint).toEqual({
      nodeId: 'rail',
      index: 1,
    })
  })

  /**
   * 🛑 A band is swept along a rail held INSIDE its shape, and the viewport draws it the very
   * handles a rail node gets. Without this the knobs were drawn on a band nothing could move.
   */
  it('poses and moves a point on the band a rail is swept into', async () => {
    render(<SceneDocument documentId="doc-1" />)
    const shape: GeometryDescriptor = {
      kind: 'ribbon',
      path: { ...DEFAULT_PATH, points: [at(0), at(10), at(20)], closed: false },
      width: 1,
      height: 0.2,
      segments: 16,
    }
    const band = { ...meshNode('band'), geometry: shape }
    act(() => useScenes.getState().runCommand('doc-1', addNode(band)))

    await act(async () => built.at(-1)?.onAddPathPoint?.('band', 0))
    await act(async () => built.at(-1)?.onPathPoint?.({ nodeId: 'band', index: 0 }, at(-4)))

    const node = nodesOf('doc-1').find(candidate => candidate.id === 'band')
    const run = node?.type === 'mesh' && node.geometry.kind === 'ribbon' ? node.geometry.path : null
    expect(run?.points.map(point => point.x)).toEqual([-4, 5, 10, 20])
  })

  /**
   * 🛑 Laying a point ON the one a run starts from is what a hand means by « join it up » — the
   * gesture every drawing tool has. Without it, Alt-Shift there folded the band back on itself.
   */
  it('joins a run up rather than folding it back on its own first point', async () => {
    render(<SceneDocument documentId="doc-1" />)
    installRail()

    await act(async () => built.at(-1)?.onClosePath?.('rail'))

    const node = nodesOf('doc-1').find(candidate => candidate.id === 'rail')
    expect(node?.type === 'path' ? node.path.closed : false).toBe(true)
    expect(pointsOf()).toEqual([0, 10, 20])
  })

  it('costs one undo entry, which puts the rail back as it was', async () => {
    render(<SceneDocument documentId="doc-1" />)
    installRail()

    await act(async () => built.at(-1)?.onAddPathPoint?.('rail', 0))
    act(() => useScenes.getState().undo('doc-1'))

    expect(pointsOf()).toEqual([0, 10, 20])
  })

  it('lays an aimed point past the last one, click after click', async () => {
    render(<SceneDocument documentId="doc-1" />)
    installRail()

    await act(async () => built.at(-1)?.onAppendPathPoint?.('rail', at(30)))
    await act(async () => built.at(-1)?.onAppendPathPoint?.('rail', at(40)))

    expect(pointsOf()).toEqual([0, 10, 20, 30, 40])
  })

  /** The gizmo has to sit on the point just laid, or a run of clicks would drag the first one. */
  it('picks the end it just laid rather than the end it started from', async () => {
    render(<SceneDocument documentId="doc-1" />)
    installRail()

    await act(async () => built.at(-1)?.onAppendPathPoint?.('rail', at(30)))

    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').pickedPathPoint).toEqual({
      nodeId: 'rail',
      index: 3,
    })
  })

  it('costs one undo entry per click, so a trajectory unwinds point by point', async () => {
    render(<SceneDocument documentId="doc-1" />)
    installRail()

    await act(async () => built.at(-1)?.onAppendPathPoint?.('rail', at(30)))
    await act(async () => built.at(-1)?.onAppendPathPoint?.('rail', at(40)))
    act(() => useScenes.getState().undo('doc-1'))

    expect(pointsOf()).toEqual([0, 10, 20, 30])
  })
})
