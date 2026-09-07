import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { PANE_TOOLBAR } from '@/components/styles'
import { forgetReportedFailures } from '@/services/diagnostics'
import { addNode } from '@/engines/scene/commands'
import { meshNode } from '@/engines/scene/scene-fixtures'
import type { SceneNode } from '@/engines/scene/sceneState'
import { useDocuments } from '@/stores/documents'
import { useSceneViews } from '@/stores/sceneViews'
import { clearScenes } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { useSettings } from '@/stores/settings'
import type { SceneRendererOptions } from '@/engines/scene/SceneRenderer'
import { useModelFiles } from '@/stores/modelFiles'
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

const box = meshNode('box-1')

/** A new document is born with three lights; only the meshes are what most of these tests count. */
function meshesOf(documentId: string): SceneNode[] {
  return nodesOf(documentId).filter(node => node.type === 'mesh')
}

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

describe('SceneDocument', () => {
  // A canvas cannot hold focus, so the host carries the tab stop: without it a running game and
  // keyboard-only navigation have nothing to fire their key events at, and a screen reader has no
  // name for the surface.
  it('exposes the viewport as a named keyboard-focusable region', async () => {
    render(<SceneDocument documentId="doc-1" />)

    const viewport = screen.getByRole('region', { name: 'Viewport 3D' })
    await userEvent.tab()

    expect(viewport).toHaveAttribute('tabindex', '0')
    expect(viewport).toHaveFocus()
    expect(viewport).not.toHaveClass('outline-none')
  })

  it('renders the shared toolbar with the scene tools', () => {
    render(<SceneDocument documentId="doc-1" />)
    expect(screen.getByRole('button', { name: /Déplacer/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pivoter/ })).toBeInTheDocument()
  })

  /**
   * Read from the design system rather than written here: the image space and the graph put their
   * bar in the same corner, and a copy of the inset is a copy that goes stale on its own.
   */
  // Two bars live over this viewport since the snap bar arrived, and only one of them is the
  // tool column. The snap bar names itself; the column is found by the orientation it declares.
  it('places its bar where every space places it', () => {
    render(<SceneDocument documentId="doc-1" />)
    const column = screen
      .getAllByRole('toolbar')
      .find(bar => bar.getAttribute('aria-orientation') === 'vertical')

    expect(column).toHaveClass(PANE_TOOLBAR)
  })

  /**
   * A canvas React owns is reused across StrictMode's mount / unmount / mount, and the first
   * engine's `dispose` purges the one WebGL context the second one then draws into — a viewport
   * black for good. The engine makes its own canvas inside a plain host instead.
   */
  it('hands the renderer a host to fill, never a canvas of its own', () => {
    const { container } = render(<SceneDocument documentId="doc-1" />)
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('switches the gizmo mode when a tool is clicked', async () => {
    render(<SceneDocument documentId="doc-1" />)
    await userEvent.click(screen.getByRole('button', { name: /Pivoter/ }))
    expect(setMode).toHaveBeenCalledWith('rotate')
  })

  it('switches the gizmo mode on the bound key', async () => {
    render(<SceneDocument documentId="doc-1" />)
    await userEvent.keyboard('{r}')
    expect(setMode).toHaveBeenCalledWith('rotate')
  })

  it('deletes the selected object on the bound key', async () => {
    useScenes.getState().runCommand('doc-1', addNode(box))
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{Delete}')
    expect(meshesOf('doc-1')).toHaveLength(0)
  })

  it('lets the keyboard alone while another tab is in front, since hidden tabs stay mounted', async () => {
    useDocuments.setState({ activeId: 'doc-2' })
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{r}')
    expect(setMode).not.toHaveBeenCalledWith('rotate')
  })

  // Through the key rather than a button: the bar drew its own pair until the Edit menu was
  // made the one place a history lives.
  it('undoes through the keyboard', async () => {
    useScenes.getState().runCommand('doc-1', addNode(box))
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{Meta>}{z}{/Meta}')
    expect(meshesOf('doc-1')).toHaveLength(0)
  })

  it('opens a new document on a lit scene rather than a black viewport', () => {
    useDocuments.setState({
      documents: {
        'doc-fresh': {
          id: 'doc-fresh',
          kind: 'scene',
          workspace: '3d',
          title: 'Fresh',
          path: 'documents/Fresh.gltf',
        },
      },
    })
    render(<SceneDocument documentId="doc-fresh" />)
    const lights = sceneOf(useScenes.getState(), 'doc-fresh').nodes.filter(
      node => node.type === 'light',
    )
    expect(lights).toHaveLength(3)
  })

  it('does not reset a scene that is already open', () => {
    useScenes.getState().runCommand('doc-1', addNode(box))
    render(<SceneDocument documentId="doc-1" />)
    expect(meshesOf('doc-1')).toHaveLength(1)
  })

  it('draws no history button of its own', () => {
    render(<SceneDocument documentId="doc-1" />)
    expect(screen.queryByRole('button', { name: /Annuler/ })).not.toBeInTheDocument()
  })

  // Armed by default, and the one mode that leaves the gizmo off the selection.
  it('opens on the selection tool', () => {
    render(<SceneDocument documentId="doc-1" />)
    expect(setMode).toHaveBeenCalledWith('select')
  })

  /**
   * The gesture the space was missing: a camera, a sprite, a caption and a rail had no panel to
   * be added from, no key, and a right-click that only answers over a node — the native Add menu,
   * three levels deep, was the whole of it.
   */
  it('adds a camera from the bar, which nothing else could reach', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.hover(screen.getByRole('button', { name: 'Ajouter un objet' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Caméra' }))

    expect(sceneOf(useScenes.getState(), 'doc-1').nodes.some(node => node.type === 'camera')).toBe(
      true,
    )
  })

  it('offers one button per family a scene grows by', () => {
    render(<SceneDocument documentId="doc-1" />)

    for (const name of ['Ajouter une maille', 'Ajouter une lumière', 'Ajouter un objet']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })
})

// Neither is a transform mode: they qualify one, and both are session state — a document that
// remembered its snapping would impose it on whoever opens it next.
