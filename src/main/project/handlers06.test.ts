import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import type { Asset } from '@shared/domain/asset'

import type { DocumentDescriptor, DocumentKind, DocumentWrite } from '@shared/domain/document'

import type { FileOutcome } from '@shared/domain/fileOp'

import { IDLE_RESCAN } from '@shared/domain/project'

import { noGame } from '@shared/domain/game'

import { noContext } from '@shared/domain/projectContext'

import { CHANNELS } from '@shared/ipc'

import { glbFile } from '@main/assets/glb-fixtures'

import { ownFileOf } from '@main/assets/protocol'

import { createTextureExtraction } from '@main/assets/textureExtraction'

import { invoke, resetHandlers } from '@main/ipc/testHarness'

import { pngBytes } from '@main/media/png-fixtures'

import { memoryCatalog } from './catalog-fixtures'

import { DEFAULT_SETTINGS, type PartialSettings } from '@shared/domain/settings'

import { registerProjectHandlers, type ProjectHandlerDeps } from './handlers'

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
   * The signature alone does for the guard, but not for the probe both picture handlers now read
   * off the very bytes they write. A `Buffer` because that is what the handler decodes its base64
   * into, and a `Uint8Array` beside it would fail the deep equality on the call.
   */
  const png = (width: number, height: number): Buffer => Buffer.from(pngBytes({ width, height }))

  describe('a motion the band posed', () => {
    const backend = () => ({
      importFromUrl: vi.fn(),
      importFromBytes: vi.fn(async () => asset({ id: 'asset-new', type: 'animation' })),
      importFromFile: vi.fn(async () => asset({ id: 'asset-new', type: 'animation' })),
      replaceBytes: vi.fn(async () => asset({ id: 'asset-walk', type: 'animation' })),
    })

    /** A binary glTF holding nothing but an empty scene — the shape, which is all this door reads. */
    const glb = (): Uint8Array => glbFile({ scenes: [{}] })

    it('files a motion of its own under a new identifier', async () => {
      const assets = backend()
      registerProjectHandlers(deps(catalog, { assets }))

      await invoke(CHANNELS.assetsSaveAnimation, {
        name: 'Marche',
        derivedFrom: 'asset-1',
        glb: glb(),
      })

      expect(assets.importFromBytes).toHaveBeenCalledWith(
        {
          id: 'asset-new',
          name: 'Marche',
          type: 'animation',
          extension: '.glb',
          derivedFrom: 'asset-1',
        },
        glb(),
      )
    })

    /**
     * A motion reopened on the workbench and corrected lands on the file it came from. Without
     * this every pass files a copy beside the last, and none of them is the motion any more.
     */
    it('rewrites the motion it was told to replace', async () => {
      await catalog.add(asset({ id: 'asset-walk', name: 'Marche', type: 'animation' }))
      const assets = backend()
      registerProjectHandlers(deps(catalog, { assets }))

      await invoke(CHANNELS.assetsSaveAnimation, {
        name: 'Marche',
        replaces: 'asset-walk',
        glb: glb(),
      })

      expect(assets.replaceBytes).toHaveBeenCalledWith('asset-walk', glb(), '.glb')
      expect(assets.importFromBytes).not.toHaveBeenCalled()
    })

    // Checked against the CATALOGUE, as the character's own save is: an id naming a model would
    // rewrite that model with a motion, and the character would be gone.
    it('refuses to overwrite anything that is not a motion', async () => {
      await catalog.add(asset({ id: 'asset-hero', name: 'Héros', type: 'mesh' }))
      registerProjectHandlers(deps(catalog, { assets: backend() }))

      await expect(
        invoke(CHANNELS.assetsSaveAnimation, {
          name: 'Marche',
          replaces: 'asset-hero',
          glb: glb(),
        }),
      ).rejects.toThrow()
      await expect(
        invoke(CHANNELS.assetsSaveAnimation, {
          name: 'Marche',
          replaces: 'asset-gone',
          glb: glb(),
        }),
      ).rejects.toThrow()
    })
  })

  describe('a channel the renderer computed', () => {
    const backend = () => ({
      importFromUrl: vi.fn(),
      importFromBytes: vi.fn(async () => asset({ id: 'asset-new', type: 'image' })),
      importFromFile: vi.fn(async () => asset({ id: 'asset-new', type: 'image' })),
      replaceBytes: vi.fn(),
    })

    /**
     * A channel goes in as a picture whose `map` is set, which is what a slot reads of the shelf,
     * and carries its `map` so the catalogue can later be asked which normal maps a project holds.
     */
    it('files it as a channel of the project, under a new identifier', async () => {
      const assets = backend()
      registerProjectHandlers(deps(catalog, { assets }))

      await invoke(CHANNELS.assetsSaveTexture, {
        name: 'Brique — Normale',
        map: 'normal',
        derivedFrom: 'asset-1',
        png: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      })

      expect(assets.importFromBytes).toHaveBeenCalledWith(
        {
          id: 'asset-new',
          name: 'Brique — Normale',
          type: 'image',
          extension: '.png',
          map: 'normal',
          derivedFrom: 'asset-1',
        },
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      )
    })

    /**
     * A channel is a picture on the shelf, so it owes its reader the dimensions any other one
     * shows. Read from the bytes here, where they are already in hand — a row with no probe left
     * the inspector with nothing to print for half the pictures in a project.
     */
    it('carries the dimensions of the channel it just wrote', async () => {
      const assets = backend()
      registerProjectHandlers(deps(catalog, { assets }))

      await invoke(CHANNELS.assetsSaveTexture, {
        name: 'Brique — Normale',
        map: 'normal',
        png: png(2048, 2048),
      })

      expect(assets.importFromBytes).toHaveBeenCalledWith(
        expect.objectContaining({
          probe: { duration: 0, codec: 'png', width: 2048, height: 2048 },
        }),
        expect.anything(),
      )
    })

    it('never hands back where the file sits', async () => {
      const assets = backend()
      assets.importFromBytes = vi.fn(async () =>
        asset({ id: 'asset-new', type: 'image', sourcePath: '/Users/someone/secret.png' }),
      )
      registerProjectHandlers(deps(catalog, { assets }))

      const saved = await invoke(CHANNELS.assetsSaveTexture, {
        name: 'Brique',
        map: 'normal',
        png: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      })

      expect(saved).toEqual(expect.not.objectContaining({ sourcePath: expect.anything() }))
    })

    /** Bytes with no channel are an ordinary picture: this door files channels, and says so. */
    it('refuses a request that names no channel', async () => {
      registerProjectHandlers(deps(catalog, { assets: backend() }))

      await expect(
        invoke(CHANNELS.assetsSaveTexture, {
          name: 'Brique',
          png: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        }),
      ).rejects.toThrow()
    })

    /** The renderer is the sandboxed side, and this one writes a file to the user's disk. */
    it('refuses a channel it has never heard of', async () => {
      registerProjectHandlers(deps(catalog, { assets: backend() }))

      await expect(
        invoke(CHANNELS.assetsSaveTexture, {
          name: 'Brique',
          map: 'displacement',
          png: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        }),
      ).rejects.toThrow()
    })

    /** The renderer is sandboxed, and this door writes a file: an unbounded buffer is a partition. */
    it('refuses a payload past the ceiling', async () => {
      registerProjectHandlers(deps(catalog, { assets: backend() }))

      await expect(
        invoke(CHANNELS.assetsSaveTexture, {
          name: 'Brique',
          map: 'normal',
          png: new Uint8Array(257 * 1024 * 1024),
        }),
      ).rejects.toThrow()
    })

    /**
     * The bytes are checked, not merely bounded. An encoder that answered with nothing would
     * otherwise be catalogued as a channel, and the tile would show an empty frame for a file
     * that is not a picture — with no way, from there, to read why.
     */
    it('refuses bytes that are not a PNG', async () => {
      registerProjectHandlers(deps(catalog, { assets: backend() }))

      for (const png of [new Uint8Array(), new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])]) {
        await expect(
          invoke(CHANNELS.assetsSaveTexture, { name: 'Brique', map: 'normal', png }),
        ).rejects.toThrow()
      }
    })

    it('refuses a source identifier that is not one', async () => {
      registerProjectHandlers(deps(catalog, { assets: backend() }))

      await expect(
        invoke(CHANNELS.assetsSaveTexture, {
          name: 'Brique',
          map: 'normal',
          derivedFrom: '   ',
          png: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        }),
      ).rejects.toThrow()
    })

    it('refuses a request with no name to file it under', async () => {
      registerProjectHandlers(deps(catalog, { assets: backend() }))

      await expect(
        invoke(CHANNELS.assetsSaveTexture, {
          name: '   ',
          map: 'normal',
          png: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        }),
      ).rejects.toThrow()
    })
  })
})
