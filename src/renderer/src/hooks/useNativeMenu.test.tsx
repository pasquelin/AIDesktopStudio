import { aiRoleId } from '@shared/domain/aiRole'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuAbility, MenuCheck } from '@shared/domain/command'
import type { SceneAddRequest, SceneDisplayRequest, Unsubscribe } from '@shared/ipc'
import { workshopIdOf } from '@shared/domain/character'
import { installCharacterDocument } from '@/stores/character-fixtures'
import { installScene } from '@/stores/scene-fixtures'
import type { CommandId } from '@shared/domain/command'
import type { ToolId, ToolSurface } from '@shared/domain/tool'
import type * as ToolRegistryModule from '@/helpers/toolRegistry'

type ToolRegistry = typeof ToolRegistryModule
import { bridgeWatchingLogs, installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useLayouts } from '@/stores/layouts'
import { useModels } from '@/stores/models'
import { sceneOf, useScenes } from '@/stores/scenes'
import { displayOfPane } from '@/stores/sceneViewChrome'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'

const saveDocument = vi.fn((_documentId: string) => Promise.resolve())
const saveDocumentAs = vi.fn((_documentId: string) => Promise.resolve(true))

// What saving does is `documentIo`'s own suite; what this one is about is the menu reaching it.
vi.mock('@/features/shell/documentIo', () => ({
  saveDocument: (documentId: string) => saveDocument(documentId),
}))
vi.mock('@/features/shell/documentSaveAs', () => ({
  saveDocumentAs: (documentId: string) => saveDocumentAs(documentId),
}))

/**
 * Counted, not replaced: what the guard below saves is this walk over the whole tool registry,
 * and the suite has to be able to see it NOT happening.
 */
const listedTools = vi.fn()

vi.mock('@/helpers/toolRegistry', async importOriginal => {
  const actual = await importOriginal<ToolRegistry>()
  return {
    ...actual,
    availableToolIds: (surface: ToolSurface) => {
      listedTools()
      return actual.availableToolIds(surface)
    },
  }
})

const { useNativeMenu } = await import('./useNativeMenu')

/** Holds the listener the hook registers on a menu channel, so the test can play the menu. */
function captureMenu<T>(channel: 'onSceneAdd' | 'onCommand' | 'onSceneDisplay') {
  let listener: ((payload: T) => void) | null = null
  const watched = bridgeWatchingLogs({
    menu: {
      [channel]: (callback: (payload: T) => void): Unsubscribe => {
        listener = callback
        return () => {
          listener = null
        }
      },
    },
  })
  return { ...watched, emit: (payload: T) => listener?.(payload) }
}

const captureSceneAdd = () => captureMenu<SceneAddRequest>('onSceneAdd')
const captureCommand = () => captureMenu<CommandId>('onCommand')
const captureSceneDisplay = () => captureMenu<SceneDisplayRequest>('onSceneDisplay')

function meshes() {
  return sceneOf(useScenes.getState(), 'doc-1').nodes.filter(node => node.type === 'mesh')
}

beforeEach(() => {
  vi.clearAllMocks()
  installScene('doc-1')
  // Cleared with the rest: how a scene is drawn is what half of this suite now asserts on, and
  // a view left behind by another test reads as one this one set.
  useSceneViews.setState({ views: {} })
})

describe('useNativeMenu', () => {
  it('adds the node the native menu asked for', () => {
    const menu = captureSceneAdd()
    renderHook(() => useNativeMenu())

    menu.emit({ kind: 'box' })

    expect(meshes()).toHaveLength(1)
    expect(meshes()[0]?.name).toBe('Box')
  })

  // A kind that is announced but not buildable yet reaches the same guard as an unknown one,
  // which `node-factory.test.ts` pins; here it must simply leave the scene alone.
  it('adds nothing for a primitive that is not buildable yet', () => {
    const menu = captureSceneAdd()
    renderHook(() => useNativeMenu())

    menu.emit({ kind: 'text' })

    expect(meshes()).toEqual([])
  })

  // The menu is app-wide: a node written under an image document would give it a scene and a
  // history it has no editor for.
  it('adds nothing when the document in front is not a scene', () => {
    useDocuments.setState({
      documents: {
        'doc-1': {
          id: 'doc-1',
          kind: 'image',
          workspace: 'image',
          title: 'Sans titre',
          path: 'documents/Sans titre.ora',
        },
      },
      activeId: 'doc-1',
    })
    const menu = captureSceneAdd()
    renderHook(() => useNativeMenu())

    menu.emit({ kind: 'box' })

    expect(meshes()).toEqual([])
  })

  it('adds nothing when no document is in front', () => {
    useDocuments.setState({ activeId: null })
    const menu = captureSceneAdd()
    renderHook(() => useNativeMenu())

    menu.emit({ kind: 'box' })

    expect(meshes()).toEqual([])
  })

  it('saves the document in front when the menu asks, and only that one', () => {
    const menu = captureCommand()
    renderHook(() => useNativeMenu())

    menu.emit('document.save')

    expect(saveDocument).toHaveBeenCalledWith('doc-1')
  })

  // The menu is application-wide and knows nothing of tabs; saving with none in front would
  // have to guess which document was meant.
  it('saves nothing when no document is in front', () => {
    useDocuments.setState({ activeId: null })
    const menu = captureCommand()
    renderHook(() => useNativeMenu())

    menu.emit('document.save')

    expect(saveDocument).not.toHaveBeenCalled()
  })

  it('copies the document in front when the menu asks for Save as', () => {
    const menu = captureCommand()
    renderHook(() => useNativeMenu())

    menu.emit('document.saveAs')

    expect(saveDocumentAs).toHaveBeenCalledWith('doc-1')
  })

  // Same reason as saving: with no tab in front there is no document to copy.
  it('copies nothing when no document is in front', () => {
    useDocuments.setState({ activeId: null })
    const menu = captureCommand()
    renderHook(() => useNativeMenu())

    menu.emit('document.saveAs')

    expect(saveDocumentAs).not.toHaveBeenCalled()
  })

  /**
   * `saveDocumentAs` journals its own failures under `assets.copy` — the shelf the copy would
   * have landed in — and answers false rather than rejecting. A second scope reported here would
   * say the same failure twice, under a name that does not fit it.
   */
  it('leaves a refused copy to say so itself, without a second report', async () => {
    saveDocumentAs.mockReturnValueOnce(Promise.resolve(false))
    const menu = captureCommand()
    renderHook(() => useNativeMenu())

    expect(() => menu.emit('document.saveAs')).not.toThrow()

    expect(menu.report).not.toHaveBeenCalled()
  })

  /**
   * A menu command runs outside React, so a failed one has nowhere to surface: the tab simply
   * keeps its modified marker. The log is what says why it kept it.
   */
  it('records a save the project refused, rather than swallowing it', async () => {
    saveDocument.mockReturnValueOnce(Promise.reject(new Error('no project')))
    const menu = captureCommand()
    renderHook(() => useNativeMenu())

    expect(() => menu.emit('document.save')).not.toThrow()
    await vi.waitFor(() =>
      expect(menu.report).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'document.save', message: expect.any(String) }),
      ),
    )
  })
})

describe('what the native menu is told', () => {
  const setWorkspace = vi.fn(() => Promise.resolve())

  function lastPublished(): {
    surface: string
    tools: readonly ToolId[]
    checked: readonly MenuCheck[]
    abilities: readonly MenuAbility[]
    scope: string | null
  } {
    // Typed by the stub rather than by the bridge; the call is what the hook actually sent.
    const [surface, tools, checked, abilities, scope] = (setWorkspace.mock.lastCall ??
      []) as unknown as [
      string,
      readonly ToolId[],
      readonly MenuCheck[],
      readonly MenuAbility[],
      string | null,
    ]
    return { surface, tools, checked, abilities, scope }
  }

  beforeEach(() => {
    installFakeBridge({ window: { setWorkspace } })
    // `home: false` explicitly: the flag starts true on every launch, and what these cases are
    // about is the space in front — the home has its own case below.
    useLayouts.setState({ activeWorkspace: 'image', home: false })
    useModels.setState({ selected: {} })
  })

  // Published on mount rather than on the first switch: the workspace is restored from the
  // persisted state without ever going through `setActiveWorkspace`.
  it('announces the restored section without waiting for a switch', () => {
    renderHook(() => useNativeMenu())
    expect(lastPublished().surface).toBe('image')
  })

  /**
   * The surface, not the space behind it. The home covers a workspace rather than replacing it,
   * so `activeWorkspace` still names one there — and the menu built on that name offered the
   * whole image toolbox, plus the Image menu, over a screen that edits no image.
   */
  it('names the home rather than the space it covers', () => {
    useLayouts.setState({ home: true })
    renderHook(() => useNativeMenu())
    expect(lastPublished().surface).toBe('home')
  })

  it('names the space again once the home is dismissed', () => {
    useLayouts.setState({ home: true })
    renderHook(() => useNativeMenu())
    useLayouts.getState().setHome(false)
    expect(lastPublished().surface).toBe('image')
  })

  /** Whose history ⌘Z pops is announced as a scope: the menu never sees a document kind. */
  it('announces the history the space in front edits through', () => {
    renderHook(() => useNativeMenu())
    expect(lastPublished().scope).toBe('canvas')
  })

  it('announces no history over the home, which edits nothing', () => {
    useLayouts.setState({ home: true })
    renderHook(() => useNativeMenu())
    expect(lastPublished().scope).toBeNull()
  })

  it('follows a change of section', () => {
    renderHook(() => useNativeMenu())
    useLayouts.getState().setActiveWorkspace('3d')
    expect(lastPublished().surface).toBe('3d')
  })

  /**
   * It used to be left out while nothing served the section's family, and the native menu said so
   * too — so the way to a model was missing from the one place that offers one. ADR-23 § D.
   */
  it('announces the generator whether or not a model is chosen', () => {
    renderHook(() => useNativeMenu())
    expect(lastPublished().tools).toContain('generator')

    useModels.getState().select(aiRoleId('image', 'txt2img'), 'flux-dev')
    expect(lastPublished().tools).toContain('generator')
  })

  /**
   * The ticks. Without them a "Skeletons" row would read the same whether they are drawn or
   * not — which is why the six toggles could not simply move off the bar.
   */
  describe('the rows it reports as ticked', () => {
    it('names the way the main view draws, and nothing else, on a scene nobody has touched', () => {
      renderHook(() => useNativeMenu())
      expect(lastPublished().checked).toEqual(['scene.display:shaded'])
    })

    it('names a toggle as soon as it is on', () => {
      renderHook(() => useNativeMenu())
      useSceneViews.getState().setSkeletons('doc-1', true)
      expect(lastPublished().checked).toContain('scene.skeletons')
    })

    /** All five at once: each is a branch of its own, and one left untested is one left unsaid. */
    it('names every toggle that is on', () => {
      renderHook(() => useNativeMenu())
      const views = useSceneViews.getState()

      views.setProjection('doc-1', 'orthographic')
      views.setQuad('doc-1', true)
      views.setQuadEdges('doc-1', true)
      views.setSkeletons('doc-1', true)
      views.setPoseMode('doc-1', true)

      expect(lastPublished().checked).toEqual([
        'scene.display:shaded',
        'scene.projection',
        'scene.quad',
        'scene.quadEdges',
        'scene.skeletons',
        'scene.poseMode',
      ])
    })

    it('drops it again when it goes off', () => {
      renderHook(() => useNativeMenu())
      useSceneViews.getState().setQuad('doc-1', true)
      useSceneViews.getState().setQuad('doc-1', false)
      expect(lastPublished().checked).not.toContain('scene.quad')
    })

    it('follows the way the main view draws', () => {
      renderHook(() => useNativeMenu())
      useSceneViews.getState().setDisplay('doc-1', 0, 'matcap')
      expect(lastPublished().checked).toContain('scene.display:matcap')
    })

    // A model tab has no scene id, so its View rows read the view of its workshop.
    it('reads the workshop of the model tab in front', () => {
      installCharacterDocument('doc-hero', 'asset-hero')
      renderHook(() => useNativeMenu())
      useSceneViews.getState().setSkeletons(workshopIdOf('asset-hero'), true)
      useSceneViews.getState().setDisplay(workshopIdOf('asset-hero'), 0, 'wireframe')

      expect(lastPublished().checked).toEqual(['scene.display:wireframe', 'scene.skeletons'])
    })

    /**
     * `useSceneViews` carries the animation playhead, written on every frame of a running
     * animation. Published without a comparison, a played scene would send sixty messages a
     * second for a menu that never changes.
     */
    it('sends nothing at all when a write changes nothing the menu draws', () => {
      renderHook(() => useNativeMenu())
      const sent = setWorkspace.mock.calls.length

      useSceneViews.getState().setPlayhead('doc-1', 1_000_000)
      useSceneViews.getState().setPlayhead('doc-1', 2_000_000)

      expect(setWorkspace.mock.calls.length).toBe(sent)
    })

    /**
     * And does not even PRICE one. Dropping the message is half the answer: the context costs a
     * walk over the whole tool registry and a `JSON.stringify` of its result, and paying that
     * sixty times a second to throw it away is the very thing the playhead would cause.
     */
    it('does not even build the context a frame of animation would throw away', () => {
      renderHook(() => useNativeMenu())
      listedTools.mockClear()

      useSceneViews.getState().setPlayhead('doc-1', 1_000_000)
      useSceneViews.getState().setPlayhead('doc-1', 2_000_000)

      expect(listedTools).not.toHaveBeenCalled()
    })

    /** The guard prices one the moment a tick really moves, or it would freeze the menu. */
    it('builds it again as soon as a tick actually moves', () => {
      renderHook(() => useNativeMenu())
      listedTools.mockClear()

      useSceneViews.getState().setQuad('doc-1', true)

      expect(listedTools).toHaveBeenCalled()
    })
  })

  /** What the menu greys out — see `MenuAbility`, which carries why. */
  describe('the rows it reports as answerable', () => {
    /** Written straight into the scene, which is exactly how a duplicate and a ⌘Z write one. */
    const pick = (ids: readonly string[]): void => {
      const scene = sceneOf(useScenes.getState(), 'doc-1')
      useScenes.getState().replace('doc-1', { ...scene, selectedIds: ids })
    }

    /** The three document rows travel with any tab in front, this decor holding one. */
    const IN_FRONT: MenuAbility[] = [
      'document.save',
      'document.saveAs',
      'document.saveCopy',
      'document.close',
    ]

    it('offers nothing to export where nothing is picked', () => {
      renderHook(() => useNativeMenu())
      expect(lastPublished().abilities).toEqual(IN_FRONT)
    })

    /** The scene is the source, so a pick nothing pointed the studio at counts all the same. */
    it('offers the selection export on a pick the studio was never pointed at', () => {
      renderHook(() => useNativeMenu())
      pick(['node-1'])
      expect(lastPublished().abilities).toEqual([...IN_FRONT, 'scene.exportSelection'])
    })

    it('takes it back when the selection empties', () => {
      renderHook(() => useNativeMenu())
      pick(['node-1'])
      pick([])
      expect(lastPublished().abilities).toEqual(IN_FRONT)
    })

    it('withholds closing the tab while the home covers it', () => {
      useLayouts.setState({ home: true })
      renderHook(() => useNativeMenu())
      expect(lastPublished().abilities).toEqual([
        'document.save',
        'document.saveAs',
        'document.saveCopy',
      ])
    })

    /** A timeline drag writes the scene on every pointer move, and moves nothing that is picked. */
    it('sends nothing when the scene is written without the pick changing', () => {
      renderHook(() => useNativeMenu())
      pick(['node-1'])
      const sent = setWorkspace.mock.calls.length

      pick(['node-1'])

      expect(setWorkspace.mock.calls.length).toBe(sent)
    })
  })
})

describe('what the native View menu asks of the scene', () => {
  it('switches the main view to the way of drawing the row named', () => {
    const menu = captureSceneDisplay()
    renderHook(() => useNativeMenu())

    menu.emit({ mode: 'wireframe' })

    expect(displayOfPane(sceneViewOf(useSceneViews.getState(), 'doc-1').displays, 0)).toBe(
      'wireframe',
    )
  })

  it('draws nothing when the document in front is not a scene', () => {
    useDocuments.setState({ activeId: null })
    const menu = captureSceneDisplay()
    renderHook(() => useNativeMenu())

    menu.emit({ mode: 'wireframe' })

    expect(displayOfPane(sceneViewOf(useSceneViews.getState(), 'doc-1').displays, 0)).toBe('shaded')
  })

  it('draws the workshop of the model tab in front', () => {
    installCharacterDocument('doc-hero', 'asset-hero')
    const menu = captureSceneDisplay()
    renderHook(() => useNativeMenu())

    menu.emit({ mode: 'matcap' })

    const workshop = sceneViewOf(useSceneViews.getState(), workshopIdOf('asset-hero'))
    expect(displayOfPane(workshop.displays, 0)).toBe('matcap')
  })
})
