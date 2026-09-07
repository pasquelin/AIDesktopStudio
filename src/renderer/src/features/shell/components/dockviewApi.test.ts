import type { DockviewApi } from 'dockview-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { FileView } from '@shared/domain/fileView'
import { useDocuments } from '@/stores/documents'
import { useLayouts } from '@/stores/layouts'
import {
  closePanel,
  closeFileView,
  openFileView,
  openDocument,
  openPanelIds,
  setDockviewApi,
  setDocumentTitle,
  showWorkspace,
  documentIsMarkedModified,
  fileViewsHoldEdits,
  registerFileViewSave,
  settleFileViews,
} from './dockviewApi'
import { bridgeWatchingLogs, installFakeBridge } from '@/services/fakeBridge'

const scene: DocumentDescriptor = {
  id: 'doc-1',
  kind: 'scene',
  title: 'Niveau',
  workspace: '3d',
  path: 'documents/Niveau.gltf',
}
const sequence: DocumentDescriptor = {
  id: 'doc-2',
  kind: 'sequence',
  title: 'Bande annonce',
  workspace: 'video',
  path: 'documents/Bande annonce.otio',
}
const controls: FileView = {
  id: 'inputMap',
  path: 'Controls/character.input.json',
  title: 'character',
}

type Panel = {
  id: string
  setTitle: ReturnType<typeof vi.fn>
  api: { setActive: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }
}

const fakePanel = (id: string): Panel => ({
  id,
  setTitle: vi.fn(),
  api: { setActive: vi.fn(), close: vi.fn() },
})

/**
 * A Dockview api that only holds panels. The real one needs a layout engine and a DOM box; what
 * this module does with it is add, find, retitle and close — nothing that needs a layout.
 *
 * `restored` is what a real remount comes back with: `fromJSON` rebuilds the stored panels
 * before the api is handed over.
 */
function fakeApi(...restored: readonly string[]) {
  const panels: Panel[] = restored.map(fakePanel)
  const addPanel = vi.fn((options: { id: string }): void => {
    panels.push(fakePanel(options.id))
  })

  const api = {
    panels,
    addPanel,
    getPanel: (id: string) => panels.find(panel => panel.id === id),
  }
  // The real type carries thirty members this module never touches.
  return { api: api as unknown as DockviewApi, addPanel, panels }
}

const mount = (...restored: readonly string[]) => {
  const fake = fakeApi(...restored)
  setDockviewApi(fake.api)
  return fake
}

/** The home COVERS the centre, which is the one state where Dockview is not on screen. */
const coverWithHome = (): void => {
  useLayouts.setState({ home: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  useDocuments.setState({ documents: {}, stored: [], activeId: null, recent: {} })
  useLayouts.setState({ activeWorkspace: '3d', home: false, layout: null })
})

afterEach(() => void closeFileView('file:Controls/character.input.json'))

describe('opening a document', () => {
  it('adds a panel for it', () => {
    const { addPanel } = mount()

    openDocument(scene)

    expect(addPanel).toHaveBeenCalledWith({
      id: 'doc-1',
      component: 'scene',
      title: 'Niveau',
      params: { documentId: 'doc-1' },
    })
  })

  // A panel whose document the window has never heard of renders "no longer open".
  it('takes the descriptor in before the panel exists', () => {
    mount()

    openDocument(scene)
    expect(useDocuments.getState().documents['doc-1']).toBe(scene)
  })

  // Dockview refuses a second panel under an id it already holds.
  it('brings an already-open document forward rather than opening it twice', () => {
    const { addPanel, panels } = mount()
    openDocument(scene)

    openDocument(scene)

    expect(addPanel).toHaveBeenCalledTimes(1)
    expect(panels[0]?.api.setActive).toHaveBeenCalled()
  })

  /**
   * The centre is ONE Dockview holding every section at once, so a sequence opened while a scene
   * is in front becomes a tab beside it — no switch, no waiting, and the two can be split side by
   * side.
   */
  it('adds a document of another section to the same centre', () => {
    const { addPanel } = mount()
    openDocument(scene)

    openDocument(sequence)

    expect(addPanel).toHaveBeenCalledTimes(2)
    expect(openPanelIds()).toEqual(['doc-1', 'doc-2'])
  })

  // The centre no longer changes with the section, but the DOCKS do: opening a sequence has to
  // bring the montage's tools up, or the tab lands under the tools of the space it left.
  it('puts the section of the document up around it', () => {
    mount()

    openDocument(sequence)

    expect(useLayouts.getState().activeWorkspace).toBe('video')
  })
})

describe('opening a registered file view', () => {
  it('adds its editor and brings an existing tab forward', () => {
    const { addPanel, panels } = mount()

    openFileView(controls)
    openFileView(controls)

    expect(addPanel).toHaveBeenCalledTimes(1)
    expect(addPanel).toHaveBeenCalledWith({
      id: 'file:Controls/character.input.json',
      component: 'inputMap',
      title: 'character',
      params: { path: 'Controls/character.input.json' },
    })
    expect(panels[0]?.api.setActive).toHaveBeenCalled()
  })
})

/**
 * The home renders INSTEAD of the centre, so a document opened from one of its panels arrives
 * while Dockview is unmounted — and any api handed over earlier belongs to a torn-down instance.
 */
describe('opening a document while the home covers the centre', () => {
  it('adds nothing to the api of the centre the home replaced', () => {
    const covered = mount()
    coverWithHome()

    openDocument(scene)
    expect(covered.addPanel).not.toHaveBeenCalled()
  })

  it('leaves the home, which is what mounts the centre', () => {
    coverWithHome()

    openDocument(scene)
    expect(useLayouts.getState().home).toBe(false)
  })

  it('opens it once the centre reports itself', () => {
    coverWithHome()
    openDocument(scene)

    const arriving = mount()

    expect(arriving.addPanel).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-1' }))
  })

  it('gives the tab back to a centre that came back without it', () => {
    coverWithHome()
    openDocument(scene)
    mount()

    const remounted = mount()

    expect(remounted.addPanel).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-1' }))
  })

  it('does not add a second tab when the centre restored it', () => {
    coverWithHome()
    openDocument(scene)
    mount()

    const remounted = mount('doc-1')

    expect(remounted.addPanel).not.toHaveBeenCalled()
  })
})

/**
 * Choosing a section drives the DOCKS, and the centre holds every section's tabs at once — so
 * the gesture also has to say which of that section's tabs comes forward, or the rail and the
 * tab strip end up describing two different documents.
 */
describe('choosing a section', () => {
  it('makes it the active section', () => {
    mount()

    showWorkspace('video')

    expect(useLayouts.getState().activeWorkspace).toBe('video')
  })

  it('brings the tab that section was last left in forward', () => {
    const { panels } = mount()
    openDocument(scene)
    openDocument({ ...scene, id: 'doc-3', title: 'Autre' })
    useDocuments.getState().activate('doc-3')
    useDocuments.getState().activate('doc-2')

    showWorkspace('3d')

    expect(panels[1]?.api.setActive).toHaveBeenCalled()
    expect(panels[0]?.api.setActive).not.toHaveBeenCalled()
  })

  // `recent` is never swept when a tab closes: a trail through tabs that are gone is answered
  // by falling back rather than by a second piece of bookkeeping to get wrong.
  it('falls back to another of its tabs when the remembered one is closed', () => {
    const { panels } = mount()
    openDocument(scene)
    openDocument({ ...scene, id: 'doc-4', title: 'Autre' })
    useDocuments.getState().activate('doc-1')
    useDocuments.getState().close('doc-1')

    showWorkspace('3d')

    expect(panels[1]?.api.setActive).toHaveBeenCalled()
  })

  // The docks still change; emptying the centre of the document being read would be a worse
  // answer than leaving it where it is.
  it('leaves the centre alone when the section has no tab open', () => {
    const { panels } = mount()
    openDocument(scene)

    showWorkspace('audio')

    expect(panels[0]?.api.setActive).not.toHaveBeenCalled()
    expect(useLayouts.getState().activeWorkspace).toBe('audio')
  })

  it('brings the tab forward once the home has given the centre back', () => {
    mount()
    openDocument(scene)
    useDocuments.getState().activate('doc-1')
    coverWithHome()

    showWorkspace('3d')
    const arriving = mount('doc-1')

    expect(arriving.panels[0]?.api.setActive).toHaveBeenCalled()
  })
})

describe('the panels of the centre', () => {
  it('names them in the order they are shown', () => {
    mount()
    openDocument(scene)
    openDocument({ ...scene, id: 'doc-3', title: 'Autre' })

    expect(openPanelIds()).toEqual(['doc-1', 'doc-3'])
  })
})

describe('a file view tab', () => {
  it('saves modified work before closing when the native question asks it to', async () => {
    const save = vi.fn(() => Promise.resolve(true))
    installFakeBridge({ documents: { confirmClose: () => Promise.resolve('save') } })
    const { panels } = mount()
    openFileView(controls)
    const release = registerFileViewSave('file:Controls/character.input.json', save)
    setDocumentTitle('file:Controls/character.input.json', 'character', true)

    void closeFileView('file:Controls/character.input.json')

    await vi.waitFor(() => expect(save).toHaveBeenCalled())
    expect(panels[0]?.api.close).toHaveBeenCalled()
    release()
  })

  // The layout restores a `file:` panel at launch and nothing registers it: only the orphan sweep
  // used to take it away. Kept on screen, it has to be askable and closable like one opened here.
  it('asks about and closes a modified file view the layout restored', async () => {
    installFakeBridge({ documents: { confirmClose: () => Promise.resolve('discard') } })
    const { panels } = mount('file:Controls/character.input.json')
    setDocumentTitle('file:Controls/character.input.json', 'character', true)

    expect(fileViewsHoldEdits()).toBe(true)
    await expect(closeFileView('file:Controls/character.input.json')).resolves.toBe(true)

    expect(panels[0]?.api.close).toHaveBeenCalled()
    expect(fileViewsHoldEdits()).toBe(false)
  })

  it('keeps a modified file view when a project change is cancelled', async () => {
    installFakeBridge({ documents: { confirmClose: () => Promise.resolve('cancel') } })
    const { panels } = mount()
    openFileView(controls)
    setDocumentTitle('file:Controls/character.input.json', 'character', true)

    await expect(settleFileViews()).resolves.toBe(false)

    expect(panels[0]?.api.close).not.toHaveBeenCalled()
    setDocumentTitle('file:Controls/character.input.json', 'character', false)
  })

  /**
   * 🛑 A `false` nobody was asked for. The caller — leaving a project, quitting — reads it as
   * "the person said no", so the whole gesture stopped with the dialog already dismissed and
   * nothing on screen to explain it.
   */
  it('says so when the answer is to save and the view has no way to', async () => {
    const { entries } = bridgeWatchingLogs({
      documents: { confirmClose: () => Promise.resolve('save') },
    })
    mount()
    openFileView(controls)
    setDocumentTitle('file:Controls/character.input.json', 'character', true)

    await expect(settleFileViews()).resolves.toBe(false)

    expect(entries().map(entry => entry.scope)).toContain('document.save')
    setDocumentTitle('file:Controls/character.input.json', 'character', false)
  })

  it('drops unmodified file views before another project opens', async () => {
    const { panels } = mount()
    openFileView(controls)

    await expect(settleFileViews()).resolves.toBe(true)

    expect(panels[0]?.api.close).toHaveBeenCalled()
  })
})

describe('the tab of a document', () => {
  it('names the document, and says separately whether the work is not on disk', () => {
    const { panels } = mount()
    openDocument(scene)

    setDocumentTitle('doc-1', 'Niveau', true)
    expect(panels[0]?.setTitle).toHaveBeenCalledWith('Niveau')
    expect(documentIsMarkedModified('doc-1')).toBe(true)

    setDocumentTitle('doc-1', 'Niveau', false)
    expect(panels[0]?.setTitle).toHaveBeenLastCalledWith('Niveau')
    expect(documentIsMarkedModified('doc-1')).toBe(false)
  })

  it('says nothing about a document no panel holds', () => {
    mount()
    expect(() => setDocumentTitle('gone', 'Niveau', true)).not.toThrow()
    expect(() => closePanel('gone')).not.toThrow()
  })

  it('closes the panel it names', () => {
    const { panels } = mount()
    openDocument(scene)

    closePanel('doc-1')
    expect(panels[0]?.api.close).toHaveBeenCalled()
  })

  it('forgets that a closed panel was marked modified', () => {
    mount()
    openDocument(scene)
    setDocumentTitle('doc-1', 'Niveau', true)

    closePanel('doc-1')

    expect(documentIsMarkedModified('doc-1')).toBe(false)
  })
})
