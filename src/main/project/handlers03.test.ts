import { join } from 'node:path'

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

import { NoProjectError, type FolderVerdict } from './store'

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
   * 🛑 The gesture that DESTROYS, and the only one of this file that does: the folder goes to the
   * system's trash whole. `projectRename` above moves it; this one hands it away.
   */
  describe('putting a project folder in the trash', () => {
    /**
     * A folder that really holds a project, which is the gate this channel puts before the bin:
     * left at the fixture's `blank`, every case below would have passed on the early refusal
     * rather than on what it means to say.
     */
    const binning = (current: string | null, more: Partial<ProjectHandlerDeps> = {}) => {
      const injected = deps(catalog, more)
      injected.project.inspect = vi.fn((): Promise<FolderVerdict> => Promise.resolve('project'))
      injected.project.current = () =>
        current === null ? null : { path: current, manifest: MANIFEST }
      registerProjectHandlers(injected)
      return injected
    }

    it('hands the folder to the system and says it went', async () => {
      const injected = binning(null)

      await expect(invoke(CHANNELS.projectTrash, PROJECT)).resolves.toBe('trashed')

      expect(injected.trashFolder).toHaveBeenCalledWith(PROJECT)
    })

    /**
     * 🛑 The catalogue is a thread holding a file INSIDE the folder, so a project binned from
     * under an open database leaves the studio reading a folder that is in the trash.
     */
    it('closes the project first when the folder is the open one', async () => {
      const injected = binning(PROJECT)

      await invoke(CHANNELS.projectTrash, PROJECT)

      expect(injected.project.close).toHaveBeenCalled()
    })

    // The shelf lists projects that are not open, which is most of them: binning one of those
    // must not shut the studio down around whoever asked.
    it('leaves the open project alone when another folder is binned', async () => {
      const injected = binning('/Users/someone/Films/Other')

      await invoke(CHANNELS.projectTrash, PROJECT)

      expect(injected.project.close).not.toHaveBeenCalled()
    })

    /**
     * A row outlives the folder it names, so this is the ordinary case rather than a failure —
     * and `shell.trashItem` throws on a path that is not there.
     */
    it('answers that nothing went, for a folder the disk has already lost', async () => {
      const injected = binning(null, { exists: vi.fn(() => false) })

      // 🛑 `missing`, never the same answer as the refusal below: an unplugged drive reads exactly
      // like a deleted folder here, and the caller must not prune an account link over it.
      await expect(invoke(CHANNELS.projectTrash, PROJECT)).resolves.toBe('missing')

      expect(injected.trashFolder).not.toHaveBeenCalled()
    })

    /**
     * 🛑 `parseProjectPath` refuses a relative path and NOTHING else, so without this gate a path
     * a model built from a NAME — the measured failure — bins whatever folder it happens to hit.
     */
    it('refuses a folder that holds no project, and bins nothing', async () => {
      const injected = binning(null)
      injected.project.inspect = vi.fn((): Promise<FolderVerdict> => Promise.resolve('occupied'))
      resetHandlers()
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.projectTrash, '/Users/someone/Documents')).resolves.toBe(
        'not-a-project',
      )

      expect(injected.trashFolder).not.toHaveBeenCalled()
    })

    it('says so in the journal, and still refuses, when the system will not take it', async () => {
      const injected = binning(null, {
        trashFolder: vi.fn(() => Promise.reject(new Error('EPERM'))),
      })

      await expect(invoke(CHANNELS.projectTrash, PROJECT)).rejects.toThrow()

      expect(injected.record).toHaveBeenCalledWith({
        level: 'error',
        topic: 'project',
        messageKey: 'activity.projectNotTrashed',
      })
    })

    // The same refusal opening a project applies: a relative path has no project to be relative
    // to, and this one bins whatever it is handed.
    it('refuses a folder that is not absolute', async () => {
      const injected = binning(null)

      await expect(invoke(CHANNELS.projectTrash, 'relative/summer')).rejects.toThrow()

      expect(injected.trashFolder).not.toHaveBeenCalled()
    })
  })

  /**
   * 🛑 The two channels the window reaches on the way IN, before anything is open. Answered empty
   * rather than `no-project`: every launch wrote two errors in the journal over a studio doing
   * nothing wrong, and a real failure was buried among them.
   */
  describe('answering with no project open', () => {
    /**
     * 🛑 The store THROWS here, as the real one does with nothing open — `catalog()` on the way in,
     * and `documents.list` from the `path()` inside its walk. Left answering, the fixture made the
     * guard untestable: removing it kept the suite green.
     */
    const shut = () => {
      const injected = deps(catalog, {
        documents: {
          ...deps(catalog).documents,
          list: vi.fn(() => Promise.reject(new NoProjectError())),
        },
      })
      injected.project.current = () => null
      injected.project.catalog = () => {
        throw new NoProjectError()
      }
      registerProjectHandlers(injected)
      return injected
    }

    it('searches no assets rather than raising no-project', async () => {
      shut()

      await expect(invoke(CHANNELS.assetsSearch, { limit: 10 })).resolves.toEqual([])
    })

    it('lists no documents rather than raising no-project', async () => {
      shut()

      await expect(invoke(CHANNELS.documentList)).resolves.toEqual([])
    })

    // A catalogue that is OPEN and fails is news, and this is what used to be buried under the
    // two errors above — `orWhenGone` answers empty for a project that GOES, never for a failure.
    it('still raises when a project is open and the catalogue gives out', async () => {
      const injected = deps(catalog)
      injected.project.catalog = () => {
        throw new Error('database is locked')
      }
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.assetsSearch, { limit: 10 })).rejects.toThrow()
    })
  })

  /**
   * The home's shelf points at projects that are NOT open, so this one names a folder outright
   * instead of resolving against the open project.
   */
  describe('showing a recent project folder', () => {
    it('shows the folder it was handed, not one under the open project', async () => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.projectRevealFolder, '/elsewhere/summer')).resolves.toBe(true)

      expect(injected.reveal).toHaveBeenCalledWith('/elsewhere/summer')
      expect(injected.record).not.toHaveBeenCalled()
    })

    /**
     * `showItemInFolder` answers nothing and no-ops in silence, and the shelf lists folders last
     * seen days ago — so a row that reveals a folder gone from the disk was the one gesture of
     * this file that did nothing and explained nothing.
     */
    it('says so in the journal rather than showing nothing, when the folder has gone', async () => {
      const injected = deps(catalog)
      injected.exists = vi.fn(() => false)
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.projectRevealFolder, '/elsewhere/summer')).resolves.toBe(false)

      expect(injected.reveal).not.toHaveBeenCalled()
      expect(injected.record).toHaveBeenCalledWith({
        level: 'error',
        topic: 'project',
        messageKey: 'activity.projectNotRevealed',
      })
    })

    // A relative path would resolve against wherever Electron was launched from, which is the
    // very reason `parseProjectPath` demands an absolute one.
    it.each(['', '   ', 'relative/summer'])('refuses %o as a folder', async path => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.projectRevealFolder, path)).rejects.toThrow()

      expect(injected.reveal).not.toHaveBeenCalled()
    })
  })

  /**
   * The one place the studio launches a third-party application. `shell.openPath` answers with
   * a sentence rather than throwing, so the refusal has to be read rather than caught.
   */
  describe('handing a file to the system', () => {
    it('opens it under the project folder, never wherever the renderer says', async () => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.projectOpenFile, 'notes.pdf')).resolves.toBe(true)

      expect(injected.openInSystem).toHaveBeenCalledWith(join(PROJECT, 'notes.pdf'))
    })

    it('refuses a path that would climb out of the project', async () => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.projectOpenFile, '../../etc/passwd')).rejects.toThrow()

      expect(injected.openInSystem).not.toHaveBeenCalled()
    })

    // A sentence back is a refusal, and it is the system's own — in the system's language. The
    // journal says ours.
    it('says so in the journal when the system will not take it', async () => {
      const injected = deps(catalog)
      injected.openInSystem = vi.fn(async () => 'no application knows this file')
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.projectOpenFile, 'notes.pdf')).resolves.toBe(false)

      expect(injected.record).toHaveBeenCalledWith({
        level: 'error',
        topic: 'project',
        messageKey: 'activity.fileNotOpened',
      })
    })
  })
})
