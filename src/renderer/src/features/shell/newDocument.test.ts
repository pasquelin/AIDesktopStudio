import { beforeEach, describe, expect, it, vi } from 'vitest'
import { documentFolderOf, type DocumentDescriptor } from '@shared/domain/document'
import type { FileFacts } from '@shared/domain/fileInfo'
import type { DocumentKind } from '@shared/domain/document'
import type {
  NamedDocumentPlace,
  NewDocumentAnswer,
  NewDocumentAsk,
} from '@shared/domain/newDocument'
import { CHECKER_TEXTURE_IDS } from '@shared/domain/checkerTexture'
import { forgetProjectInstalls } from '@/engines/scene/projectInstalls'
import { installFakeBridge, type BridgeOverrides } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import type { WorkspaceId } from '@shared/domain/workspace'
import { useProject } from '@/stores/project'
import { useSelection } from '@/stores/selection'
import { sceneOf, useScenes } from '@/stores/scenes'
import { createDocumentOfKind, createNamedDocumentIn, openNewDocument } from './newDocument'
import type { NamedCreation } from './createScript'

const openDocument = vi.fn()
vi.mock('./components/dockviewApi', () => ({
  openDocument: (...args: unknown[]) => openDocument(...args),
}))

const stored = (title: string, fileName: string): DocumentDescriptor => ({
  id: fileName,
  kind: 'scene',
  workspace: '3d',
  title,
  path: `${documentFolderOf('scene')}/${fileName}`,
})

const FILE_FACTS: FileFacts = {
  kind: 'file',
  bytes: 1,
  createdAt: null,
  modifiedAt: '2026-08-16T10:00:00.000Z',
}

const FOLDER_FACTS: FileFacts = { ...FILE_FACTS, kind: 'folder' }

/** What the window was asked, which is the whole of what this side hands over. */
const asks: NewDocumentAsk[] = []

/** What a window that names a document answers with. The kind travels back with the name. */
const madeAs = (
  title: string,
  folder: string,
  kind: DocumentKind = 'scene',
  template?: NamedDocumentPlace['template'],
): NewDocumentAnswer => ({
  answer: 'made',
  place: { kind, title, folder, ...(template ? { template } : {}) },
})

/**
 * Installs the bridge with the window's answers already decided, in order — the last one repeats,
 * since a question put again after a project was opened has to be answered too.
 */
const answering = (
  givens: readonly (NewDocumentAnswer | null)[],
  overrides: BridgeOverrides = {},
): void => {
  let turn = 0
  installFakeBridge({
    ...overrides,
    newDocument: {
      ask: ask => {
        asks.push(ask)
        const given = givens[Math.min(turn, givens.length - 1)] ?? null
        turn += 1
        return Promise.resolve(given)
      },
    },
  })
}

const created = (): DocumentDescriptor[] => Object.values(useDocuments.getState().documents)

/** The document a named creation made — `null` where it refused a name the project already holds. */
const namedIn = async (
  workspace: WorkspaceId,
  called: NamedCreation,
): Promise<DocumentDescriptor | null> => {
  const one = await createNamedDocumentIn(workspace, called)
  return typeof one === 'string' ? null : one
}

beforeEach(() => {
  vi.clearAllMocks()
  asks.length = 0
  installFakeBridge()
  useDocuments.setState({ documents: {}, stored: [] })
  useSelection.getState().selectFiles([])
  const stamp = '2026-08-16T10:00:00.000Z'
  useProject.setState({
    project: {
      path: '/projects/One',
      manifest: { version: 1, createdAt: stamp, updatedAt: stamp },
    },
  })
})

describe('createDocumentIn', () => {
  it('calls the document what the window answers, and opens it', async () => {
    answering([madeAs('Niveau', 'Scenes')])

    // 🛑 AWAITED, where the cases below need not be: the opening happens AFTER the seeding, and
    // the seeding awaits what the app ships. Waiting on the document alone read before the
    // opening and went red under a loaded suite — green alone, the worst way to be wrong.
    await createDocumentOfKind('scene')

    expect(created()).toHaveLength(1)
    expect(created()[0]?.title).toBe('Niveau')
    // The name is the file name: there is only ever one name to change afterwards.
    expect(created()[0]?.path).toBe('Scenes/Niveau.gltf')
    expect(openDocument).toHaveBeenCalledWith(created()[0])
  })

  /**
   * What the window is told about the studio it was summoned from. The suggested name is NOT
   * here any more: the window is where a kind is picked, so the name that steps over the folder
   * can only be composed once that kind is known — see `NewDocumentForm`.
   */
  it('tells the window what is being made, and out of which project', async () => {
    answering([null])

    createDocumentOfKind('scene')

    await vi.waitFor(() => expect(asks).toHaveLength(1))
    expect(asks[0]).toMatchObject({ kind: 'scene', surface: '3d', projectName: 'One' })
  })

  /** With no kind named, the window asks that first — and the surface is what orders the list. */
  it('names no kind when the gesture did not', async () => {
    answering([null])

    void openNewDocument('materials')

    await vi.waitFor(() => expect(asks).toHaveLength(1))
    expect(asks[0]).toMatchObject({ kind: null, surface: 'materials' })
  })

  // What the window cannot read for itself: a document a tab holds and no folder does yet.
  it('hands the window the documents no file holds', async () => {
    answering([null])
    useDocuments.setState({ documents: { open: stored('Brouillon', 'Brouillon.gltf') } })

    createDocumentOfKind('scene')

    await vi.waitFor(() => expect(asks).toHaveLength(1))
    expect(asks[0]?.open.map(document => document.path)).toEqual(['Scenes/Brouillon.gltf'])
  })

  // Where the Explorer is pointing, which is where a user looking at a folder means to create.
  it('opens the window on the folder holding the picked row', async () => {
    answering([null], { project: { fileFacts: () => Promise.resolve(FILE_FACTS) } })
    useSelection.getState().selectFiles(['Images/Croquis/etude.jpg'])

    createDocumentOfKind('scene')

    await vi.waitFor(() => expect(asks).toHaveLength(1))
    expect(asks[0]?.picked).toBe('Images/Croquis')
  })

  it('opens the window on a picked folder itself', async () => {
    answering([null], { project: { fileFacts: () => Promise.resolve(FOLDER_FACTS) } })
    useSelection.getState().selectFiles(['Images/Croquis'])

    createDocumentOfKind('scene')

    await vi.waitFor(() => expect(asks).toHaveLength(1))
    expect(asks[0]?.picked).toBe('Images/Croquis')
  })

  /**
   * Nothing rather than this kind's own folder: which folder a kind belongs to depends on the
   * kind, and the kind is picked in the window. The fallback lives there — see `NewDocumentForm`.
   */
  it('points at nothing when the Explorer points at nothing', async () => {
    answering([null])

    createDocumentOfKind('scene')

    await vi.waitFor(() => expect(asks).toHaveLength(1))
    expect(asks[0]?.picked).toBeNull()
  })
})

describe('createDocumentIn results', () => {
  /**
   * The window is not the only door: a caller that supplies a title opens none — the assistant
   * and the MCP wire both do — and the fallback has to be the same one on both.
   */
  it('files a named material in the materials folder, no window opened', async () => {
    const created = await createNamedDocumentIn('materials', { title: 'Rouille' })

    expect(created).toMatchObject({ path: 'Materials/Rouille.mtlx' })
    expect(asks).toHaveLength(0)
  })

  /**
   * The window refuses a taken name where it is TYPED, and a caller that brings its own never
   * sees that field: two tabs stood on `Scenes/3rd Person.gltf` on 2026-09-09, each saving over
   * the other.
   */
  it('refuses a name the project already holds', async () => {
    await createNamedDocumentIn('materials', { title: 'Rouille' })

    expect(await createNamedDocumentIn('materials', { title: 'Rouille' })).toBe('duplicate')
    expect(created()).toHaveLength(1)
  })

  // Folded, as the naming field folds it: APFS and NTFS both answer that these are one file.
  it('refuses a name the project holds under another case', async () => {
    await createNamedDocumentIn('materials', { title: 'Rouille' })

    expect(await createNamedDocumentIn('materials', { title: 'rouille' })).toBe('duplicate')
  })

  // The disk would rewrite it, and a rewritten title is a second name for one document.
  it('refuses a title the disk would not take', async () => {
    expect(await createNamedDocumentIn('materials', { title: 'Rouille/../secret' })).toBe('invalid')
  })

  it('files the document in the folder the window answers', async () => {
    answering([madeAs('Niveau', 'Images/Croquis')])

    createDocumentOfKind('scene')

    await vi.waitFor(() => expect(created()).toHaveLength(1))
    expect(created()[0]?.path).toBe('Images/Croquis/Niveau.gltf')
  })

  // Cancelled, or the window closed — the main process answers `null` for both, and nothing may
  // be made either way.
  it('makes nothing when the creation is called off', async () => {
    answering([null])

    createDocumentOfKind('scene')

    await vi.waitFor(() => expect(asks).toHaveLength(1))
    expect(created()).toHaveLength(0)
    expect(openDocument).not.toHaveBeenCalled()
  })

  /**
   * It used to answer nothing before opening anything, which is what made a project a thing one
   * had to go and open somewhere else first. The window opens now, and offers the way in.
   */
  it('still opens the window with no project, and makes nothing without one', async () => {
    answering([madeAs('Niveau', '')])
    useProject.setState({ project: null })

    expect(await createDocumentOfKind('scene')).toBeNull()
    expect(asks).toHaveLength(1)
    expect(asks[0]?.projectName).toBeNull()
    expect(created()).toHaveLength(0)
  })

  // A caller outside the window is held on the other end of this, and "done" for a window the
  // person closed is the one answer it must never give.
  describe('what it answers', () => {
    it('the document, once the window is filled', async () => {
      answering([madeAs('Niveau', 'Scenes')])

      expect(await createDocumentOfKind('scene')).toMatchObject({ title: 'Niveau', kind: 'scene' })
    })

    it('nothing when the window is called off', async () => {
      answering([null])

      expect(await createDocumentOfKind('scene')).toBeNull()
      expect(created()).toHaveLength(0)
    })

    it('nothing with no project open', async () => {
      answering([null])
      useProject.setState({ project: null })

      expect(await createDocumentOfKind('scene')).toBeNull()
    })
  })

  /**
   * The window offers the ways into a project and takes none of them: leaving one tears down
   * panels, settles unsaved work and reloads a catalogue. The studio does it and asks again, so
   * opening a project does not cost the gesture that was being made.
   */
  describe('the ways into a project the window sends back', () => {
    it('opens the one it names, then puts the question again', async () => {
      const opened: string[] = []
      answering([{ answer: 'recentProject', path: '/projects/Two' }, null])
      useProject.setState({
        open: path => {
          opened.push(path)
          return Promise.resolve(true)
        },
      })

      expect(await createDocumentOfKind('scene')).toBeNull()
      expect(opened).toEqual(['/projects/Two'])
      expect(asks).toHaveLength(2)
    })

    it('raises the picker the window asks for', async () => {
      const raised: string[] = []
      answering([{ answer: 'newProject' }, { answer: 'openProject' }, null])
      useProject.setState({
        createPicked: () => {
          raised.push('create')
          return Promise.resolve()
        },
        openPicked: () => {
          raised.push('open')
          return Promise.resolve()
        },
      })

      await createDocumentOfKind('scene')

      expect(raised).toEqual(['create', 'open'])
      expect(asks).toHaveLength(3)
    })
  })

  // Naming it is what lets a caller finish the gesture alone: the window only a person can fill
  // never opens, so nothing is left waiting on a screen nobody is looking at.
  describe('named by its caller', () => {
    it('makes it without opening the window', async () => {
      answering([null])

      const made = await namedIn('3d', { title: 'Niveau', folder: 'Repérages' })

      expect(asks).toHaveLength(0)
      expect(made).toMatchObject({ title: 'Niveau', path: 'Repérages/Niveau.gltf' })
    })

    it('files it in the documents folder when no folder is named', async () => {
      const made = await namedIn('3d', { title: 'Niveau' })

      expect(made?.path).toBe('Scenes/Niveau.gltf')
    })
  })

  /** 🛑 The one kind whose file this module composes itself, and it composed it from the RAW
   * title — a separator in it named a file in another folder. */
  describe('the file a script lands on', () => {
    /** The paths `writeScript` was handed — a script is written before it has a tab. */
    const writing = (): string[] => {
      const asked: string[] = []
      installFakeBridge({
        game: {
          writeScript: (path: string) => {
            asked.push(path)
            return Promise.resolve(true)
          },
        },
      })
      return asked
    }

    // Refused rather than cleaned, as the naming field refuses it: a title the studio rewrites
    // is a second name for the document, and the caller is told which of the two it gave.
    it('writes nothing for a title the disk would refuse', async () => {
      const asked = writing()

      expect(await createNamedDocumentIn('code', { title: 'Niveau/../secret' })).toBe('invalid')
      expect(asked).toEqual([])
    })

    it('files a plain title where its author asked for it', async () => {
      const asked = writing()

      await namedIn('code', { title: 'Porte', folder: 'Repérages' })

      expect(asked).toEqual(['Repérages/Porte.ts'])
    })
  })

  // Filled before the tab opens: a scene that held nothing would be given the studio default by
  // `restoreDocument`, and the template would be lost between the window and the viewport.
  describe('what a new scene opens on', () => {
    it('holds the template the window answered with', async () => {
      answering([madeAs('Plateau', 'Scenes', 'scene', 'topDown')])

      const made = await createDocumentOfKind('scene')

      expect(sceneOf(useScenes.getState(), made?.id ?? '').world.play.camera).toBe('topDown')
    })

    it('takes the studio default for a caller that names none', async () => {
      const made = await namedIn('3d', { title: 'Niveau' })
      const scene = sceneOf(useScenes.getState(), made?.id ?? '')

      // `basic`: a floor, a cube of one metre, a sun, a fill and a camera.
      expect(scene.nodes.map(node => node.type)).toEqual([
        'mesh',
        'mesh',
        'light',
        'light',
        'camera',
      ])
    })

    /**
     * The defect this guards, and it reached the screen: a template lays its shapes down BEFORE
     * any editor mounts, so the hook that installs the working textures had not run — every
     * shape of the first 3D document of a session was born grey, and saved that way for good.
     *
     * The install resolves on a later turn here, which is the whole point: awaiting it is what
     * the door has to do, not hoping it already happened.
     */
    it('dresses the shapes a template lays down, however late the textures land', async () => {
      forgetProjectInstalls()
      installFakeBridge({
        assets: {
          installBundledTextures: () =>
            new Promise(resolve => {
              setTimeout(
                () => resolve(CHECKER_TEXTURE_IDS.map(id => ({ id, assetId: `asset_${id}` }))),
                0,
              )
            }),
        },
      })

      const made = await namedIn('3d', { title: 'Niveau' })
      const bare = sceneOf(useScenes.getState(), made?.id ?? '').nodes.filter(
        node => node.type === 'mesh' && node.material.map === null,
      )

      expect(bare).toEqual([])
    })

    it('leaves the other kinds alone', async () => {
      const made = await namedIn('image', { title: 'Planche' })

      expect(made?.kind).toBe('image')
      expect(sceneOf(useScenes.getState(), made?.id ?? '').nodes).toEqual([])
    })
  })
})
