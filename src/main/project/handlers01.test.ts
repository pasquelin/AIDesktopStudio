import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import type { DocumentDescriptor, DocumentKind, DocumentWrite } from '@shared/domain/document'

import type { FileOutcome } from '@shared/domain/fileOp'

import { IDLE_RESCAN } from '@shared/domain/project'

import { noGame } from '@shared/domain/game'

import { noContext } from '@shared/domain/projectContext'

import { CHANNELS } from '@shared/ipc'

import { ownFileOf } from '@main/assets/protocol'

import { createTextureExtraction } from '@main/assets/textureExtraction'

import { invoke, resetHandlers } from '@main/ipc/testHarness'

import { memoryCatalog } from './catalog-fixtures'

import { DEFAULT_SETTINGS, type PartialSettings } from '@shared/domain/settings'

import { registerProjectHandlers, type ProjectHandlerDeps } from './handlers'

import { ProjectOpenError, type FolderVerdict } from './store'

import type { AsyncCatalog } from './catalogClient'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

export const PROJECT = '/Users/someone/Films/Reel'

export const MANIFEST = { version: 1, name: 'Reel', createdAt: '', updatedAt: '' }

/** Every gesture answering "nothing happened", which each suite overrides as it needs. */
export function emptyFileOps(): ProjectHandlerDeps['files'] {
  const nothing = async (): Promise<FileOutcome> => ({ done: [], refused: [], batch: 'batch-1' })

  return {
    rename: vi.fn(nothing),
    move: vi.fn(nothing),
    duplicate: vi.fn(nothing),
    createFolder: vi.fn(nothing),
    trash: vi.fn(nothing),
    undo: vi.fn(nothing),
    redo: vi.fn(nothing),
    can: vi.fn(() => ({ undo: false, redo: false })),
    renameAsset: vi.fn(async () => undefined),
    renameAssetToCaption: vi.fn(async () => undefined),
  }
}

export function deps(catalog: AsyncCatalog, overrides: Partial<ProjectHandlerDeps> = {}) {
  const merged = { ...base(catalog), ...overrides }

  return {
    ...merged,
    // The real one unless a case hands its own: the channel is a thin wrapper over it now, so a
    // stub here would leave every case about a model's pictures asserting nothing.
    extractTextures:
      overrides.extractTextures ??
      createTextureExtraction({
        fileOf: source => ownFileOf(merged.project.path(), source),
        search: query => catalog.search(query),
        write: (request, bytes) => merged.assets.importFromBytes(request, bytes),
        replaceModel: async () => undefined,
        newAssetId: merged.newAssetId,
        record: merged.record,
      }),
  }
}

export function base(catalog: AsyncCatalog) {
  return {
    project: {
      create: vi.fn(),
      // Blank by default: the folder a test says nothing about is one nothing stands in the way
      // of, so a test that cares about a verdict is the one that sets it.
      inspect: vi.fn(async () => 'blank'),
      open: vi.fn(),
      // 🛑 The SAME folder `path()` answers. Left at `null` this store was one production can
      // never be in — a catalogue answering under no open project — and the two channels that
      // read `current()` to keep quiet at launch read a lie.
      current: () => ({ path: PROJECT, manifest: MANIFEST }),
      path: () => PROJECT,
      catalog: () => catalog,
      touch: vi.fn(),
      settled: vi.fn(async () => undefined),
      close: vi.fn(),
    } as unknown as ProjectHandlerDeps['project'],
    // Only the storage branch is read here, and only the shelf of it — the rest of the settings
    // has nothing to do with what these channels answer.
    settings: {
      read: () => DEFAULT_SETTINGS,
      write: vi.fn((partial: PartialSettings) => ({ ...DEFAULT_SETTINGS, ...partial })),
    } as unknown as ProjectHandlerDeps['settings'],
    record: vi.fn(),
    assets: {} as ProjectHandlerDeps['assets'],
    newAssetId: () => 'asset-new',
    // Untouched by the channels under test, which read the catalogue and show a file.
    documents: {
      list: vi.fn(async () => []),
      read: vi.fn(async () => null),
      write: vi.fn((): Promise<DocumentWrite> => Promise.resolve('written')),
      remove: vi.fn(async () => undefined),
      rename: vi.fn(
        async (id: string, kind: DocumentKind, title: string): Promise<DocumentDescriptor> => ({
          id,
          kind,
          title,
          workspace: '3d',
          path: `documents/${title}.gltf`,
        }),
      ),
    },
    reveal: vi.fn(),
    // Present by default: a folder that has gone is the case a test says so itself.
    exists: vi.fn(() => true),
    folder: {
      list: vi.fn(async () => []),
      search: vi.fn(async () => []),
      walk: vi.fn(async () => []),
      names: vi.fn(async () => []),
      named: vi.fn(async () => []),
    },
    // Answers an empty batch by default: what a channel DOES with an outcome is what these
    // suites are about, and `fileOps.test.ts` is where the outcome itself is settled.
    files: emptyFileOps(),
    // Idle: a window may watch a pass and call one off, and no channel here starts one.
    reconciler: { request: vi.fn(() => false), stop: vi.fn(), state: () => IDLE_RESCAN },
    // Empty: a project carrying no context is the ordinary one, and `context.test.ts` is where
    // the file itself is settled.
    context: { read: vi.fn(async () => noContext()), write: vi.fn(async () => noContext()) },
    // A project declaring no game is the ordinary one, and `game.test.ts` settles the file.
    game: { read: vi.fn(async () => noGame()), write: vi.fn(async () => noGame()) },
    scripts: { list: vi.fn(async () => []), write: vi.fn(async () => true) },
    // An empty string is what `shell.openPath` answers when the system took the file.
    openInSystem: vi.fn(async () => ''),
    // Cancel: the safe answer, so a test that does not care about the dialog cannot destroy
    // anything by not caring.
    askUser: vi.fn(async () => 2),
    // Takes the folder without complaint: a system that REFUSES is what a test says itself.
    trashFolder: vi.fn(async () => {}),
    // None running unless a case says so: no question is raised, which is the ordinary studio.
    runningJobCount: () => 0,
  }
}

describe('project handlers', () => {
  let catalog: AsyncCatalog

  beforeEach(() => {
    resetHandlers()
    vi.clearAllMocks()
    catalog = memoryCatalog()
    onTestFinished(catalog.close)
  })

  /**
   * The shelf File ▸ Open recent draws. Written here and not in the window: the open project is
   * this process's to know, and a window pairing the two would get it wrong by exactly the
   * project switch that had just happened.
   */
  describe('noting a document that was opened', () => {
    it('files it under the project this process holds open', async () => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await invoke(CHANNELS.documentOpened, 'Modelling/Scenes/Niveau.gltf', 'scene')

      expect(injected.settings.write).toHaveBeenCalledWith({
        storage: {
          recentDocuments: [
            expect.objectContaining({
              project: PROJECT,
              path: 'Modelling/Scenes/Niveau.gltf',
              kind: 'scene',
            }),
          ],
        },
      })
    })

    /**
     * Clicking the document already in front happens all day and moves nothing — writing there is
     * a disk write plus a broadcast to every window.
     */
    it('writes nothing when it is already the one at the top', async () => {
      const injected = deps(catalog)
      injected.settings.read = () => ({
        ...DEFAULT_SETTINGS,
        storage: {
          ...DEFAULT_SETTINGS.storage,
          recentDocuments: [
            {
              project: PROJECT,
              path: 'Modelling/Scenes/Niveau.gltf',
              kind: 'scene',
              openedAt: '2026-09-01T10:00:00.000Z',
            },
          ],
        },
      })
      registerProjectHandlers(injected)

      await invoke(CHANNELS.documentOpened, 'Modelling/Scenes/Niveau.gltf', 'scene')

      expect(injected.settings.write).not.toHaveBeenCalled()
    })

    /** Nothing to note rather than an error: a window with no project has opened no document. */
    it('writes nothing with no project open', async () => {
      const injected = deps(catalog)
      injected.project.current = () => null
      registerProjectHandlers(injected)

      await invoke(CHANNELS.documentOpened, 'Modelling/Scenes/Niveau.gltf', 'scene')

      expect(injected.settings.write).not.toHaveBeenCalled()
    })
  })

  // Same silence as opening, reached by the explorer's own "create a project" button: nothing
  // on the renderer side watches `createPicked` either.
  describe('creating a project in a folder that will not take one', () => {
    const refusing = (): ProjectHandlerDeps => {
      const injected = deps(catalog)
      injected.project.create = vi.fn(() => Promise.reject(new Error('EACCES')))
      return injected
    }

    it('says so in the journal', async () => {
      const injected = refusing()
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.projectCreate, PROJECT)).rejects.toThrow()

      expect(injected.record).toHaveBeenCalledWith({
        level: 'error',
        topic: 'project',
        messageKey: 'activity.projectNotCreated',
      })
    })

    // An argument this channel refuses is not a sentence about the folder — the same line
    // `openFailureKey` draws for opening.
    it('says nothing about a folder when it is the argument that was refused', async () => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.projectCreate, '')).rejects.toThrow()

      expect(injected.project.create).not.toHaveBeenCalled()
      expect(injected.record).not.toHaveBeenCalled()
    })

    it('says nothing when the folder takes one', async () => {
      const injected = deps(catalog)
      injected.project.create = vi.fn(() => Promise.resolve({ path: PROJECT, manifest: MANIFEST }))
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.projectCreate, PROJECT)).resolves.toBeDefined()

      expect(injected.record).not.toHaveBeenCalled()
    })
  })

  /**
   * The one decision this channel makes, and the reason it is not folded into `project:close`:
   * it must be answerable BEFORE the window asks about unsaved documents.
   */
  describe('asking whether the project may close', () => {
    const closing = (running: number, answer = 0): ProjectHandlerDeps => {
      const injected = deps(catalog)
      injected.runningJobCount = () => running
      injected.askUser = vi.fn(async () => answer)
      registerProjectHandlers(injected)
      return injected
    }

    // The ordinary close, and it must cost nothing: a dialog on every close would be a question
    // about a situation that is not happening.
    it('says yes without a word when nothing is running', async () => {
      const injected = closing(0)

      await expect(invoke(CHANNELS.projectAskLeave)).resolves.toBe(true)

      expect(injected.askUser).not.toHaveBeenCalled()
    })

    it('asks when a generation is still running, and answers what was pressed', async () => {
      const injected = closing(2, 1)

      await expect(invoke(CHANNELS.projectAskLeave)).resolves.toBe(true)

      expect(injected.askUser).toHaveBeenCalled()
    })

    it('refuses the closing when the question is turned down', async () => {
      closing(2, 0)

      await expect(invoke(CHANNELS.projectAskLeave)).resolves.toBe(false)
    })
  })

  describe('creating a project from the folder that was chosen', () => {
    /**
     * Registered on the spot, with the verdict the chosen folder would give and the button the
     * user would press. Both before registering: the handlers capture `askUser` by value, so a
     * test that set it afterwards would silently keep the default.
     */
    const creating = (verdict: FolderVerdict = 'blank', answer = 0): ProjectHandlerDeps => {
      const injected = deps(catalog)
      injected.project.inspect = vi.fn(async () => verdict)
      injected.project.create = vi.fn(async () => ({ path: PROJECT, manifest: MANIFEST }))
      injected.project.open = vi.fn(async () => ({ path: PROJECT, manifest: MANIFEST }))
      injected.askUser = vi.fn(async () => answer)
      registerProjectHandlers(injected)
      return injected
    }

    it('names the project after the folder, and lays it inside that folder', async () => {
      const injected = creating()

      await invoke(CHANNELS.projectCreate, '/Users/someone/Mes Projets/Bande-annonce')

      expect(injected.project.create).toHaveBeenCalledWith(
        '/Users/someone/Mes Projets/Bande-annonce',
      )
    })

    // The root of a volume has no name to give, and a nameless project is a row nobody can find.
    it('turns away a folder with no name of its own', async () => {
      const injected = creating()

      await expect(invoke(CHANNELS.projectCreate, '/')).rejects.toThrow()

      expect(injected.project.create).not.toHaveBeenCalled()
    })

    // Creating again would stamp a fresh `createdAt` on a folder that has been worked in, and
    // hand its catalogue a new identity.
    it('opens a folder that is already a project instead of writing over it', async () => {
      const injected = creating('project')

      await expect(invoke(CHANNELS.projectCreate, PROJECT)).resolves.toBeDefined()

      expect(injected.project.open).toHaveBeenCalledWith(PROJECT)
      expect(injected.project.create).not.toHaveBeenCalled()
      expect(injected.record).not.toHaveBeenCalled()
    })

    // Raised by `inspect` rather than answered, like every other folder that cannot serve.
    it('says which mistake it was when the folder sits inside another project', async () => {
      const injected = creating()
      injected.project.inspect = vi.fn(() => Promise.reject(new ProjectOpenError('nested')))

      await expect(invoke(CHANNELS.projectCreate, PROJECT)).rejects.toThrow()

      expect(injected.project.create).not.toHaveBeenCalled()
      expect(injected.record).toHaveBeenCalledWith({
        level: 'error',
        topic: 'project',
        messageKey: 'activity.projectNested',
      })
    })

    describe('when the folder already holds files of its own', () => {
      it('asks first, and writes nothing when the answer is no', async () => {
        // 0 is the dialog's cancel button, which is also what a dismissed dialog answers.
        const injected = creating('occupied', 0)

        // `null`, not a rejection: a cancelled gesture is not a failure, and nothing is journalled.
        await expect(invoke(CHANNELS.projectCreate, PROJECT)).resolves.toBeNull()

        expect(injected.askUser).toHaveBeenCalled()
        expect(injected.project.create).not.toHaveBeenCalled()
        expect(injected.record).not.toHaveBeenCalled()
      })

      it('goes ahead once the answer is yes', async () => {
        const injected = creating('occupied', 1)

        await expect(invoke(CHANNELS.projectCreate, PROJECT)).resolves.toBeDefined()

        expect(injected.project.create).toHaveBeenCalled()
      })
    })
  })
})
