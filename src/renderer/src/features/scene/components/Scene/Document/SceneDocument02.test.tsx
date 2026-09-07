import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { EVERYTHING_SNAPPED, NOTHING_SNAPPED } from '@shared/domain/snap'
import { forgetReportedFailures } from '@/services/diagnostics'
import { publishCommand } from '@/services/commandBus'
import { addNode } from '@/engines/scene/commands'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { useDocuments } from '@/stores/documents'
import { useSceneViews, sceneViewOf } from '@/stores/sceneViews'
import { clearScenes } from '@/stores/scene-fixtures'
import { sceneOf, selectIn, useScenes } from '@/stores/scenes'
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

describe('snapping and the coordinate frame', () => {
  it('opens with both off, so nothing is quietly constrained', () => {
    render(<SceneDocument documentId="doc-1" />)

    expect(setSnapping).toHaveBeenCalledWith(NOTHING_SNAPPED)
    expect(setSpace).toHaveBeenCalledWith('world')
  })

  it('arms navigation from the toolbar, and gives the pointer back on the next click', async () => {
    render(<SceneDocument documentId="doc-1" />)
    const button = screen.getByRole('button', { name: /Naviguer/ })

    await userEvent.click(button)
    expect(setNavigating).toHaveBeenLastCalledWith(true)

    await userEvent.click(button)
    expect(setNavigating).toHaveBeenLastCalledWith(false)
  })

  // Full accent says « this is what is being acted on », and only one thing ever is.
  it('arms navigation INSTEAD of the transform tool', async () => {
    render(<SceneDocument documentId="doc-1" />)
    expect(screen.getByRole('button', { name: /Sélectionner/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await userEvent.click(screen.getByRole('button', { name: /Naviguer/ }))

    expect(screen.getByRole('button', { name: /Naviguer/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Sélectionner/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  /**
   * `useShortcuts` only swallows the MOTION keys, so `G` reaches the dispatch mid-flight. Left
   * alone, the gizmo changed under a captured pointer while the bar went on showing Naviguer.
   */
  it('leaves navigation when a transform tool is armed on its key', async () => {
    render(<SceneDocument documentId="doc-1" />)
    await userEvent.click(screen.getByRole('button', { name: /Naviguer/ }))
    expect(setNavigating).toHaveBeenLastCalledWith(true)

    await userEvent.keyboard('{g}')

    expect(setMode).toHaveBeenLastCalledWith('translate')
    expect(setNavigating).toHaveBeenLastCalledWith(false)
  })

  // The pointer is captured while it is armed, and a captured pointer over a tab nobody is
  // looking at would fly a scene out of sight.
  it('disarms navigation when another tab comes to the front', async () => {
    const { rerender } = render(<SceneDocument documentId="doc-1" />)
    await userEvent.click(screen.getByRole('button', { name: /Naviguer/ }))
    expect(setNavigating).toHaveBeenLastCalledWith(true)

    useDocuments.setState({ activeId: 'doc-2' })
    rerender(<SceneDocument documentId="doc-1" />)

    expect(setNavigating).toHaveBeenLastCalledWith(false)
  })

  // A refusal that armed anything would come back the moment the tab did: the command was
  // declined, and a document brought forward on its own would enter navigation nobody asked for.
  it('does not pre-arm navigation addressed to a hidden document', () => {
    useDocuments.setState({ activeId: 'doc-2' })
    const { rerender } = render(<SceneDocument documentId="doc-1" />)

    expect(publishCommand('scene.navigate', 'doc-1')).toBe(false)

    act(() => useDocuments.setState({ activeId: 'doc-1' }))
    rerender(<SceneDocument documentId="doc-1" />)
    expect(setNavigating).not.toHaveBeenCalledWith(true)
  })

  // The hint is drawn for the eye and hidden from the reader, which is what keeps the flight
  // from being read out twice — once as a hint, once as the status this composes.
  it('announces navigation state and speed without exposing the visual hint twice', async () => {
    render(<SceneDocument documentId="doc-1" />)
    expect(screen.getByRole('status')).toHaveTextContent('Navigation désactivée')

    await userEvent.click(screen.getByRole('button', { name: /Naviguer/ }))
    act(() => built[0]?.onFlySpeedChange?.(4.5))

    expect(screen.getByRole('status')).toHaveTextContent(/Navigation activée.*4,5 m\/s.*Échap/)
    expect(screen.getByText('déplacer').closest('[aria-hidden="true"]')).toBeInTheDocument()
  })

  // The frame is session state held per document, not per mount: a detached panel put back, or a
  // tab left and returned to, would else show « local » on the bar and a world gizmo underneath.
  it('keeps the local transform frame when the same document remounts', async () => {
    const first = render(<SceneDocument documentId="doc-1" />)
    await userEvent.click(screen.getByRole('button', { name: /Repère local/ }))
    expect(setSpace).toHaveBeenLastCalledWith('local')

    first.unmount()
    render(<SceneDocument documentId="doc-1" />)

    expect(setSpace).toHaveBeenLastCalledWith('local')
  })

  // The magnet of the vertical bar is a master switch since the snap bar split the four apart:
  // one press turns everything off, the next gives back exactly what was on.
  it('toggles every snap from the toolbar and back off on the next click', async () => {
    render(<SceneDocument documentId="doc-1" />)
    const button = screen.getByRole('button', { name: /Tous les magnétismes/ })

    await userEvent.click(button)
    expect(setSnapping).toHaveBeenLastCalledWith(EVERYTHING_SNAPPED)

    await userEvent.click(button)
    expect(setSnapping).toHaveBeenLastCalledWith(NOTHING_SNAPPED)
  })

  it('toggles every snap on the bound key', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{m}')
    expect(setSnapping).toHaveBeenLastCalledWith(EVERYTHING_SNAPPED)
  })

  // Reaching for a step IS asking for that snap: leaving the choice inert cost a second click on
  // every first use. Where this bar parts from Unreal — arbitrage d'Alban.
  it('arms a snap by choosing its step, without a second click', async () => {
    render(<SceneDocument documentId="doc-1" />)

    // Hovered, not clicked: the menu opens on the way in, and a click there would put it away.
    await userEvent.hover(screen.getByRole('button', { name: /Pas de la grille/ }))
    await userEvent.click(screen.getByRole('radio', { name: '1 m' }))

    expect(setSnapping).toHaveBeenLastCalledWith({ ...NOTHING_SNAPPED, translate: true })
  })

  // The whole point of the snap bar: one kind arms without the other three following it.
  it('arms one snap alone from the snap bar', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Magnétisme de grille' }))

    expect(setSnapping).toHaveBeenLastCalledWith({ ...NOTHING_SNAPPED, translate: true })
  })

  it('swaps the coordinate frame from the toolbar', async () => {
    render(<SceneDocument documentId="doc-1" />)
    const button = screen.getByRole('button', { name: /Repère local/ })

    await userEvent.click(button)
    expect(setSpace).toHaveBeenLastCalledWith('local')

    await userEvent.click(button)
    expect(setSpace).toHaveBeenLastCalledWith('world')
  })

  it('swaps the coordinate frame on the bound key', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.keyboard('{l}')
    expect(setSpace).toHaveBeenLastCalledWith('local')
  })

  // Held down, not armed: turning snapping on must not disarm the transform mode.
  it('draws a toggle as pressed without unarming the tool', async () => {
    render(<SceneDocument documentId="doc-1" />)
    await userEvent.click(screen.getByRole('button', { name: /Pivoter/ }))
    await userEvent.click(screen.getByRole('button', { name: /Tous les magnétismes/ }))

    expect(screen.getByRole('button', { name: /Tous les magnétismes/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /Pivoter/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('carries the snap steps into the engine with the rest of the viewport settings', () => {
    configure.mockClear()
    useSettings.setState({
      settings: { ...DEFAULT_SETTINGS, three: { ...DEFAULT_SETTINGS.three, snapRotate: 45 } },
    })

    render(<SceneDocument documentId="doc-1" />)

    expect(configure).toHaveBeenCalledWith(expect.objectContaining({ snapRotate: 45 }))
  })
})

// They used to be four wide buttons in the inspector, framing duplicating the bar's own. What
// matters is that the bar reaches the SAME rules — `sceneVisibility` holds them, and it is what
// makes leaving an isolation the very press that entered it.
describe('the visibility tools', () => {
  /** They act on a SELECTION, and the bar greys them out without one. */
  const withChosenBox = (): void => {
    useScenes.getState().runCommand('doc-1', addNode(box))
    selectIn('doc-1', ['box-1'])
  }

  // `acts` is what would take the pressed state away, so the toggle is asserted where it shows
  // rather than on the descriptor's own flag.
  it('isolates what is chosen, and gives the scene back on the second press', async () => {
    withChosenBox()
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.click(screen.getByRole('button', { name: /Isoler/ }))
    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').isolation.only).not.toBeNull()

    // The word follows the state: armed, the button offers the way OUT — it would otherwise
    // read « Isolate » over a scene that is already isolated.
    const armed = screen.getByRole('button', { name: /Rétablir la vue/ })
    expect(armed).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(armed)
    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').isolation.only).toBeNull()
    expect(screen.getByRole('button', { name: /Isoler/ })).toHaveAttribute('aria-pressed', 'false')
  })

  // Hiding arms the same button, since `isolating` counts a hidden node too — so the word has
  // to follow there as well, or it offers to isolate what it is about to reveal.
  it('offers the way out after a plain hide, never « isolate » over it', async () => {
    withChosenBox()
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.click(screen.getByRole('button', { name: /Masquer/ }))

    expect(screen.getByRole('button', { name: /Rétablir la vue/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Isoler/ })).not.toBeInTheDocument()
  })

  it('hides the selection without touching what the document holds', async () => {
    withChosenBox()
    render(<SceneDocument documentId="doc-1" />)

    await userEvent.click(screen.getByRole('button', { name: /Masquer/ }))

    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').isolation.hidden.size).toBeGreaterThan(0)
    expect(sceneOf(useScenes.getState(), 'doc-1').nodes.every(node => node.visible)).toBe(true)
  })

  it('gives everything back with show all', async () => {
    withChosenBox()
    render(<SceneDocument documentId="doc-1" />)
    await userEvent.click(screen.getByRole('button', { name: /Masquer/ }))
    // Stated before the second click: zero is also the value this starts on, so asserting it
    // at the end alone would pass with both buttons doing nothing at all.
    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').isolation.hidden.size).toBe(1)

    await userEvent.click(screen.getByRole('button', { name: /Tout afficher/ }))

    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').isolation.hidden.size).toBe(0)
  })
})

describe('the viewport settings', () => {
  it('pushes them into the engine, which holds no truth of its own', () => {
    configure.mockClear()
    useSettings.setState({
      settings: { ...DEFAULT_SETTINGS, three: { ...DEFAULT_SETTINGS.three, flySpeed: 12 } },
    })

    render(<SceneDocument documentId="doc-1" />)

    expect(configure).toHaveBeenCalledWith(expect.objectContaining({ flySpeed: 12 }))
  })

  // The tab title was read imperatively and captured: a renamed document kept its old label
  // until the modified marker next flipped.
  it('follows a document renamed while its tab is open', async () => {
    render(<SceneDocument documentId="doc-1" />)

    await act(async () => {
      useDocuments.setState({
        documents: {
          'doc-1': {
            id: 'doc-1',
            kind: 'scene',
            workspace: '3d',
            title: 'Renamed',
            path: 'documents/Renamed.gltf',
          },
        },
      })
    })

    expect(setDocumentTitle).toHaveBeenLastCalledWith('doc-1', 'Renamed', expect.any(Boolean))
  })
})
