import { mkdtemp, rm } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import type { Asset } from '@shared/domain/asset'

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

import { ProjectOpenError } from './store'

import type { ProjectOpenFailure } from '@shared/domain/project'

import type { AsyncCatalog } from './catalogClient'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

export const PROJECT = '/Users/someone/Films/Reel'

export const MANIFEST = { version: 1, name: 'Reel', createdAt: '', updatedAt: '' }

export const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'asset-1',
  name: 'A001',
  type: 'video',
  location: 'local',
  tags: [],
  createdAt: '2026-08-07T10:00:00.000Z',
  ...overrides,
})

/** A project store answering for a real folder — what a handler reading a file off disk needs. */
export function projectAt(root: string, catalog?: AsyncCatalog): ProjectHandlerDeps['project'] {
  return {
    create: vi.fn(),
    open: vi.fn(),
    current: () => ({ path: root, manifest: MANIFEST }),
    path: () => root,
    catalog: () => catalog,
    touch: vi.fn(),
    settled: vi.fn(async () => undefined),
    close: vi.fn(),
  } as unknown as ProjectHandlerDeps['project']
}

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

  // The renderer's own `openPicked` watches nothing: without a line in the journal, a folder
  // that is not a project failed in silence.
  describe('opening a folder that will not open', () => {
    const failing = (reason: ProjectOpenFailure): ProjectHandlerDeps => {
      const injected = deps(catalog)
      injected.project.open = vi.fn(() => Promise.reject(new ProjectOpenError(reason)))
      return injected
    }

    const said: [ProjectOpenFailure, string][] = [
      ['not-a-project', 'activity.projectNotAProject'],
      ['unreadable', 'activity.projectUnreadable'],
      ['too-new', 'activity.projectTooNew'],
    ]

    it.each(said)('says %s in the journal', async (reason, messageKey) => {
      const injected = failing(reason)
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.projectOpen, PROJECT)).rejects.toThrow()

      expect(injected.record).toHaveBeenCalledWith({
        level: 'error',
        topic: 'project',
        messageKey,
      })
    })

    // Rethrown as well as recorded: `open` on the renderer side forgets a folder nothing can
    // open, and it only knows to when the promise rejects.
    it('still lets the failure through', async () => {
      registerProjectHandlers(failing('not-a-project'))

      await expect(invoke(CHANNELS.projectOpen, PROJECT)).rejects.toThrow()
    })

    // Only the named ones: a disk that gave out mid-open is not a sentence about the folder.
    it('says nothing for a failure that is not about the folder', async () => {
      const injected = deps(catalog)
      injected.project.open = vi.fn(() => Promise.reject(new Error('EIO')))
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.projectOpen, PROJECT)).rejects.toThrow()

      expect(injected.record).not.toHaveBeenCalled()
    })
  })

  /**
   * `updatedAt` is what says when the project last did some work, so it moves when a document
   * lands — and only then: a manifest stamped for a save the disk refused would lie.
   */
  describe('saving a document', () => {
    it('stamps the manifest once the document is written', async () => {
      const injected = deps(catalog)
      registerProjectHandlers(injected)

      await invoke(CHANNELS.documentWrite, 'doc-1', 'image', { title: 'A', content: '{}' })

      expect(injected.documents.write).toHaveBeenCalled()
      expect(injected.project.touch).toHaveBeenCalled()
    })

    it('leaves the stamp alone when the write failed', async () => {
      const injected = deps(catalog)
      injected.documents.write = vi.fn(() => Promise.reject(new Error('ENOSPC')))
      registerProjectHandlers(injected)

      await expect(
        invoke(CHANNELS.documentWrite, 'doc-1', 'image', { title: 'A', content: '{}' }),
      ).rejects.toThrow()

      expect(injected.project.touch).not.toHaveBeenCalled()
    })
  })

  // The renderer has no filesystem: a path there is only ever text on screen, and handing the
  // window every user's folder layout widens what a compromised dependency could read.
  it('searches without ever handing back where a linked file sits', async () => {
    await catalog.add(asset({ sourcePath: '/Volumes/Rushes/A001.mov' }))
    registerProjectHandlers(deps(catalog))

    const found = await invoke(CHANNELS.assetsSearch, {})

    expect(found).toEqual([expect.not.objectContaining({ sourcePath: expect.anything() })])
    expect(found).toEqual([expect.objectContaining({ name: 'A001' })])
  })

  // Six numbers rather than the catalogue: the home draws a counter per kind, and reading the
  // rows to count them would carry a whole project across the boundary to print six integers.
  it('answers how many of each kind the project holds', async () => {
    await catalog.add(asset())
    await catalog.add(asset({ id: 'asset-2', type: 'image' }))
    registerProjectHandlers(deps(catalog))

    await expect(invoke(CHANNELS.assetsCounts)).resolves.toEqual({
      image: 1,
      video: 1,
      audio: 0,
      mesh: 0,
      skybox: 0,
      animation: 0,
    })
  })

  it('shows a linked file where the user actually put it', async () => {
    await catalog.add(asset({ sourcePath: '/Volumes/Rushes/A001.mov' }))
    const injected = deps(catalog)
    registerProjectHandlers(injected)

    await expect(invoke(CHANNELS.assetsReveal, 'asset-1')).resolves.toBe(true)
    expect(injected.reveal).toHaveBeenCalledWith('/Volumes/Rushes/A001.mov')
  })

  // Showing someone `.index/proxies/ab12….mp4` in place of the rush they linked is showing
  // them a file they never made.
  it('shows the rush and not the proxy the studio made of it', async () => {
    await catalog.add(
      asset({ sourcePath: '/Volumes/Rushes/A001.mov', proxyPath: '.index/proxies/ab12.mp4' }),
    )
    const injected = deps(catalog)
    registerProjectHandlers(injected)

    await invoke(CHANNELS.assetsReveal, 'asset-1')
    expect(injected.reveal).toHaveBeenCalledWith('/Volumes/Rushes/A001.mov')
  })

  it('shows a generated asset inside the project folder', async () => {
    await catalog.add(asset({ id: 'asset-1', type: 'image', path: 'assets/img/one.png' }))
    const injected = deps(catalog)
    registerProjectHandlers(injected)

    await invoke(CHANNELS.assetsReveal, 'asset-1')
    expect(injected.reveal).toHaveBeenCalledWith(`${PROJECT}/assets/img/one.png`)
  })

  it('answers no rather than opening anything for an asset with no file', async () => {
    await catalog.add(asset({ location: 'cloud' }))
    const injected = deps(catalog)
    registerProjectHandlers(injected)

    await expect(invoke(CHANNELS.assetsReveal, 'asset-1')).resolves.toBe(false)
    expect(injected.reveal).not.toHaveBeenCalled()
  })

  it('answers no for an asset the catalogue does not hold', async () => {
    const injected = deps(catalog)
    registerProjectHandlers(injected)

    await expect(invoke(CHANNELS.assetsReveal, 'asset-gone')).resolves.toBe(false)
    expect(injected.reveal).not.toHaveBeenCalled()
  })

  describe('which assets have lost their file', () => {
    it('names the rows the disk no longer answers for, and only those', async () => {
      await catalog.add(asset({ id: 'asset-1', type: 'image', path: 'assets/img/here.png' }))
      await catalog.add(asset({ id: 'asset-2', type: 'image', path: 'assets/img/gone.png' }))
      const injected = deps(catalog)
      injected.exists = (path: string) => path.endsWith('here.png')
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.assetsAbsent, ['asset-1', 'asset-2'])).resolves.toEqual([
        'asset-2',
      ])
    })

    // A cloud-only row is elsewhere, not lost. Marking it would put a warning on the one state
    // that is perfectly fine, and the browser reads this answer to decide what to warn about.
    it('never calls an asset with no file of its own absent', async () => {
      await catalog.add(asset({ id: 'asset-1', location: 'cloud' }))
      const injected = deps(catalog)
      injected.exists = () => false
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.assetsAbsent, ['asset-1'])).resolves.toEqual([])
    })

    // A linked rush lives outside the project, and its own path is what has to be looked at —
    // not a path resolved against a folder it was never in.
    it('looks a linked medium up where the user actually put it', async () => {
      await catalog.add(asset({ id: 'asset-1', sourcePath: '/Volumes/Rushes/A001.mov' }))
      const injected = deps(catalog)
      const asked: string[] = []
      injected.exists = (path: string) => {
        asked.push(path)
        return false
      }
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.assetsAbsent, ['asset-1'])).resolves.toEqual(['asset-1'])
      expect(asked).toEqual(['/Volumes/Rushes/A001.mov'])
    })

    it('says nothing about an id the catalogue does not hold', async () => {
      const injected = deps(catalog)
      injected.exists = () => false
      registerProjectHandlers(injected)

      await expect(invoke(CHANNELS.assetsAbsent, ['asset-gone'])).resolves.toEqual([])
    })

    it('refuses a list that is not one, rather than passing junk to the catalogue', async () => {
      registerProjectHandlers(deps(catalog))
      await expect(invoke(CHANNELS.assetsAbsent, 'asset-1')).rejects.toThrow()
    })
  })

  it('refuses an identifier that is not one, rather than passing junk to the catalogue', async () => {
    registerProjectHandlers(deps(catalog))
    await expect(invoke(CHANNELS.assetsReveal, '')).rejects.toThrow()
  })

  /**
   * 🛑 The link back to what a take was edited FROM, which nothing else keeps: a "Save as" that
   * drops it leaves the new file untraceable, and `assets.search({ derivedFrom })` stops finding
   * it. It was silently deleted from this one handler and no case rougissait.
   */
  describe('an edited take saved beside its source', () => {
    it('keeps the asset it was derived from', async () => {
      const root = await mkdtemp(join(tmpdir(), 'scenario-take-'))
      onTestFinished(async () => await rm(root, { recursive: true, force: true }))
      const assets = {
        importFromUrl: vi.fn(),
        importFromBytes: vi.fn(async (request: unknown, _bytes: Uint8Array) => {
          void request
          return asset({ id: 'asset-new', type: 'audio' })
        }),
        importFromFile: vi.fn(),
        replaceBytes: vi.fn(),
      }
      registerProjectHandlers(deps(catalog, { assets, project: projectAt(root, catalog) }))

      await invoke(CHANNELS.assetsSaveAudio, {
        name: 'Take 2',
        wav: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
        derivedFrom: 'asset-1',
      })

      const [written] = assets.importFromBytes.mock.calls
      expect(written?.[0]).toMatchObject({ derivedFrom: 'asset-1' })
    })
  })
})
