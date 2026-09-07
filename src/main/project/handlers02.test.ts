import { join } from 'node:path'

import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import type { DocumentDescriptor, DocumentKind, DocumentWrite } from '@shared/domain/document'

import type { FileOutcome } from '@shared/domain/fileOp'

import { IDLE_RESCAN } from '@shared/domain/project'

import { noGame } from '@shared/domain/game'

import { noContext } from '@shared/domain/projectContext'

import { CHANNELS, EVENTS } from '@shared/ipc'

import { ownFileOf } from '@main/assets/protocol'

import { createTextureExtraction } from '@main/assets/textureExtraction'

import { invoke, openWindow, resetHandlers } from '@main/ipc/testHarness'

import { memoryCatalog } from './catalog-fixtures'

import { DEFAULT_SETTINGS, type PartialSettings } from '@shared/domain/settings'

import { registerProjectHandlers, type ProjectHandlerDeps } from './handlers'

import type { AsyncCatalog } from './catalogClient'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

export const PROJECT = '/Users/someone/Films/Reel'

export const MANIFEST = { version: 1, name: 'Reel', createdAt: '', updatedAt: '' }

export const RENAMED = { path: PROJECT, manifest: { ...MANIFEST, name: 'Summer' } }

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

  describe('walking the project folder', () => {
    it('lists the folder that was asked for', async () => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await invoke(CHANNELS.projectListFolder, 'assets/img', false)

      expect(injected.folder.list).toHaveBeenCalledWith('assets/img', false)
    })

    /**
     * The reader asks; the main process decides. `.index/` and `.project.json` are shown on this
     * flag and stay refused by every gesture — `filePlan.test.ts` holds that half.
     */
    it('shows what a dot hides only when the window asked for it', async () => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await invoke(CHANNELS.projectListFolder, '', true)

      expect(injected.folder.list).toHaveBeenCalledWith('', true)
    })

    it('searches the whole folder, which is the source the tree cannot be', async () => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await invoke(CHANNELS.projectSearchFolder, 'ruelle', false)

      expect(injected.folder.search).toHaveBeenCalledWith('ruelle', false)
    })

    // The one channel where a window names a path of its own, and `join` walks out of the
    // project on every platform. The listing must never be reached at all.
    it('refuses a path that would climb out of the project', async () => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.projectListFolder, '../..', false)).rejects.toThrow()

      expect(injected.folder.list).not.toHaveBeenCalled()
    })
  })

  describe('the three gestures of the explorer menu', () => {
    it('shows a file in the system file manager, under the project folder', async () => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await invoke(CHANNELS.projectRevealFile, 'assets/img/one.png')

      expect(injected.reveal).toHaveBeenCalledWith(join(PROJECT, 'assets/img/one.png'))
    })

    // A name with a separator in it would move the file rather than rename it, which is not what
    // the row says it does.
    it.each(['../escape', 'sub/one.txt', ''])('refuses %s as a new name', async name => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.projectRenameFile, 'notes.txt', name)).rejects.toThrow()

      expect(injected.files.rename).not.toHaveBeenCalled()
    })

    // The destination is the second path these channels take from a window, and it escapes the
    // project exactly as easily as the first.
    it.each(['../escape', '/etc', 'sub\\..\\out'])('refuses %s as a destination', async folder => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.projectMoveFiles, ['notes.txt'], folder)).rejects.toThrow()

      expect(injected.files.move).not.toHaveBeenCalled()
    })

    it.each([CHANNELS.projectRevealFile, CHANNELS.projectOpenFile])(
      'refuses a path that would climb out of the project on %s',
      async channel => {
        const injected = deps(catalog)
        registerProjectHandlers(injected)

        await expect(invoke(channel, '../../etc/passwd')).rejects.toThrow()

        expect(injected.reveal).not.toHaveBeenCalled()
      },
    )

    it('tells every window what a batch did, so a tree that did not ask still follows', async () => {
      const injected = deps(catalog)
      const outcome: FileOutcome = {
        done: [{ from: 'notes.txt', to: 'refs/notes.txt' }],
        refused: [],
        batch: 'batch-1',
      }
      injected.files.move = vi.fn(async () => outcome)
      const window = openWindow()
      registerProjectHandlers(injected)

      await invoke(CHANNELS.projectMoveFiles, ['notes.txt'], 'refs')

      expect(window.sent).toContainEqual({ channel: EVENTS.filesChanged, payload: outcome })
    })

    // A batch that refused everything says nothing to the other windows: nothing moved, and a
    // tree re-reading its folders would find exactly what it already holds.
    it('says how many were refused in the journal, and wakes nobody', async () => {
      const injected = deps(catalog)
      injected.files.move = vi.fn(async (): Promise<FileOutcome> => ({
        done: [],
        refused: [
          { path: 'a.png', reason: 'exists' },
          { path: 'b.png', reason: 'missing' },
        ],
        batch: 'batch-1',
      }))
      const window = openWindow()
      registerProjectHandlers(injected)

      await invoke(CHANNELS.projectMoveFiles, ['a.png', 'b.png'], 'refs')

      expect(injected.record).toHaveBeenCalledWith({
        level: 'error',
        topic: 'project',
        messageKey: 'activity.filesRefused',
        params: { count: 2 },
      })
      expect(window.sent.map(one => one.channel)).not.toContain(EVENTS.filesChanged)
    })

    // The one gesture undo cannot take back, so it is the one gesture that asks.
    it('asks before trashing a batch, and writes nothing when the answer is no', async () => {
      const injected = deps(catalog)
      injected.askUser = vi.fn(async () => 0)
      registerProjectHandlers(injected)

      await invoke(CHANNELS.projectTrashFiles, ['a.png', 'b.png'])

      expect(injected.askUser).toHaveBeenCalled()
      expect(injected.files.trash).not.toHaveBeenCalled()
    })

    it('trashes one file without asking, which is where the row was clicked', async () => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await invoke(CHANNELS.projectTrashFiles, ['a.png'])

      expect(injected.askUser).not.toHaveBeenCalled()
      expect(injected.files.trash).toHaveBeenCalledWith(['a.png'])
    })

    // One channel, two settings: what the clipboard held is moved when it was cut and copied
    // when it was not, and a second channel would be a second place to keep in step.
    it('pastes by moving when the clipboard was cut, and by copying when it was not', async () => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await invoke(CHANNELS.projectPasteFiles, ['a.png'], 'refs', true)
      expect(injected.files.move).toHaveBeenCalledWith(['a.png'], 'refs')

      await invoke(CHANNELS.projectPasteFiles, ['a.png'], 'refs', false)
      expect(injected.files.duplicate).toHaveBeenCalledWith(['a.png'], 'refs')
    })
  })

  /**
   * The name in the manifest, never the folder on disk: `recentProjects`, `storage.lastProject`
   * and every absolute path the catalogue holds are keyed on that folder.
   */
  describe('renaming a project', () => {
    const renaming = (current: string | null, rename = vi.fn(async () => RENAMED)) => {
      const injected = deps(catalog)
      injected.project.rename = rename
      injected.project.current = () =>
        current === null ? null : { path: current, manifest: MANIFEST }
      registerProjectHandlers(injected)
      return { injected, rename }
    }

    it('writes the new name and answers the renamed project', async () => {
      const { rename } = renaming(null)

      await expect(invoke(CHANNELS.projectRename, PROJECT, 'Summer')).resolves.toEqual(RENAMED)

      expect(rename).toHaveBeenCalledWith(PROJECT, 'Summer')
    })

    /**
     * Every window replicates the open project, so the title bar of a second one would go on
     * naming the name that was just replaced.
     */
    it('tells every window, when the renamed project is the one open', async () => {
      const window = openWindow()
      renaming(PROJECT)

      await invoke(CHANNELS.projectRename, PROJECT, 'Summer')

      expect(window.sent).toContainEqual({ channel: EVENTS.projectChanged, payload: RENAMED })
    })

    // The shelf renames projects that are not open, which is most of them: announcing one of
    // those as the project in front would swap the studio out from under whoever renamed it.
    it('tells nobody when it is another project on the shelf', async () => {
      const window = openWindow()
      renaming('/Users/someone/Films/Other')

      await invoke(CHANNELS.projectRename, PROJECT, 'Summer')

      expect(window.sent).toEqual([])
    })

    // The folder can have gone since the shelf last saw it — the same failure opening reports,
    // and the shelf is exactly where a stale row lives.
    it('says so in the journal, and still refuses', async () => {
      const { injected } = renaming(
        PROJECT,
        vi.fn(() => Promise.reject(new Error('read-only disk'))),
      )

      await expect(invoke(CHANNELS.projectRename, PROJECT, 'Summer')).rejects.toThrow()

      expect(injected.record).toHaveBeenCalledWith({
        level: 'error',
        topic: 'project',
        messageKey: 'activity.projectNotRenamed',
      })
    })

    // A name is a manifest field, not a path segment: it is parsed, and an empty one would leave
    // a row on the shelf that nothing can be found by.
    it.each(['', '   '])('refuses %o as a name', async name => {
      const { rename } = renaming(PROJECT)

      await expect(invoke(CHANNELS.projectRename, PROJECT, name)).rejects.toThrow()

      expect(rename).not.toHaveBeenCalled()
    })

    it('refuses a folder that is not absolute', async () => {
      const { rename } = renaming(PROJECT)

      await expect(invoke(CHANNELS.projectRename, 'relative/summer', 'Summer')).rejects.toThrow()

      expect(rename).not.toHaveBeenCalled()
    })
  })
})
