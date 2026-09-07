import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import type { SceneExportCommand } from '@shared/ipc'
import { forgetReportedFailures } from '@/services/diagnostics'
import { bridgeWatchingLogs } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useSceneViews, sceneViewOf } from '@/stores/sceneViews'
import { clearScenes } from '@/stores/scene-fixtures'
import { useSettings } from '@/stores/settings'
import type { SceneRendererOptions } from '@/engines/scene/SceneRenderer'
import { useModelFiles } from '@/stores/modelFiles'
import { DISPLAY_MODES } from '@shared/domain/scene'
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

describe('how the scene is looked at', () => {
  // On the key rather than a button: the row moved to the native View menu, which ticks it.
  it('swaps the projection on the key', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{o}')

    expect(setProjection).toHaveBeenCalledWith('orthographic')
  })

  it('swaps it back on the second press', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{o}')
    await userEvent.keyboard('{o}')

    expect(setProjection).toHaveBeenLastCalledWith('perspective')
  })

  // The button wears the mode it draws, so it is the mode's own name that names it.
  it('changes what the viewport draws from the flyout', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.hover(screen.getByRole('button', { name: /Rendu/ }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: /^Filaire/ }))

    expect(setDisplayModes).toHaveBeenLastCalledWith(['wireframe'], false)
  })

  it('cycles through every mode on the bound key, and comes back round', async () => {
    render(<SceneDocument documentId="doc-1" />)

    const seen: string[] = []
    for (let press = 0; press < DISPLAY_MODES.length; press += 1) {
      await userEvent.keyboard('{z}')
      const [modes] = setDisplayModes.mock.lastCall ?? []
      seen.push(String(modes))
    }

    // Starting from shaded, one press per mode lands on each of the others and returns.
    expect(seen).toEqual([...DISPLAY_MODES.slice(1), DISPLAY_MODES[0]].map(String))
  })

  it('reads the edges as quads on the bound key, and back as triangles', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{Shift>}{W}{/Shift}')
    expect(setDisplayModes).toHaveBeenLastCalledWith(['shaded'], true)

    await userEvent.keyboard('{Shift>}{W}{/Shift}')
    expect(setDisplayModes).toHaveBeenLastCalledWith(['shaded'], false)
  })

  /** Four views, four answers: the key lands on the one the pointer is over, and on no other. */
  it('changes only the view the pointer is over', async () => {
    activePane.mockReturnValue(2)
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{z}')

    expect(setDisplayModes).toHaveBeenLastCalledWith(['shaded', 'shaded', 'wireframe'], false)
    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').displays[0]).toBe('shaded')
  })

  // Session state, per document: two scenes side by side are two points of view.
  it('leaves the view of another document alone', async () => {
    render(<SceneDocument documentId="doc-1" />)
    await userEvent.keyboard('{o}')

    expect(sceneViewOf(useSceneViews.getState(), 'doc-2').projection).toBe('perspective')
  })
})

describe('exporting the scene', () => {
  /** The menu is what asks for an export; this is the hand that pulls its lever. */
  function bridgeThatExports(exported: () => Promise<string | null>) {
    let ask: ((command: SceneExportCommand) => void) | null = null

    const watched = bridgeWatchingLogs({
      menu: {
        onSceneExport: callback => {
          ask = callback
          return () => {}
        },
      },
      scene: { export: exported },
    })

    return { ...watched, ask: () => ask?.({ format: 'glb', scope: 'scene' }) }
  }

  it('hands the encoded scene over under the document title', async () => {
    const exported = vi.fn(() => Promise.resolve('set.glb'))
    const bridge = bridgeThatExports(exported)
    render(<SceneDocument documentId="doc-1" />)

    await act(async () => bridge.ask())

    expect(exported).toHaveBeenCalledWith(expect.objectContaining({ name: 'Set dressing' }))
  })

  // Nothing awaits the export: a refused write would otherwise look exactly like a dismissed
  // dialog, which is how a failed save goes unnoticed.
  it('records a write the disk refused', async () => {
    const bridge = bridgeThatExports(() => Promise.reject(new Error('read-only volume')))
    render(<SceneDocument documentId="doc-1" />)

    await act(async () => bridge.ask())

    expect(bridge.report).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'scene.export',
        message: expect.stringContaining('read-only volume'),
      }),
    )
  })

  /**
   * The other half, and the one no bridge failure covers: `GLTFExporter` and `USDZExporter` throw
   * on a compressed texture, which the KTX2 loader makes an ordinary thing for an imported model
   * to wear. Left outside the guard, that rejection reached nobody and the menu click did nothing.
   */
  it('records an encoding the exporter refused', async () => {
    exportTo.mockRejectedValueOnce(new Error('setTextureUtils() must be called'))
    const bridge = bridgeThatExports(() => Promise.resolve('set.glb'))
    render(<SceneDocument documentId="doc-1" />)

    await act(async () => bridge.ask())

    expect(bridge.report).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'scene.export',
        message: expect.stringContaining('setTextureUtils'),
      }),
    )
  })
  it('shows the bones of a rigged model on the bound key, and hides them again', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{b}')
    expect(setSkeletons).toHaveBeenLastCalledWith(true)

    await userEvent.keyboard('{b}')
    expect(setSkeletons).toHaveBeenLastCalledWith(false)
  })

  it('splits the viewport in four on the bound key, and puts it back', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{Shift>}{Q}{/Shift}')
    expect(setQuadView).toHaveBeenLastCalledWith(true)

    await userEvent.keyboard('{Shift>}{Q}{/Shift}')
    expect(setQuadView).toHaveBeenLastCalledWith(false)
  })
})

/**
 * The engine cannot see the catalogue, and the id a texture slot points at does not move when ⌘S
 * rewrites the picture behind it. Without this the scene showed the image an edit replaced until
 * something rebuilt the engine.
 */
