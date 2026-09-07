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

  describe('a layered picture the editor edited', () => {
    // Bytes, not base64: a surface crosses the bridge as what it is — see `OraSurface`.
    const PNG_BYTES = Uint8Array.from(png(1024, 768))

    const backend = () => ({
      importFromUrl: vi.fn(),
      importFromBytes: vi.fn(async () => asset({ id: 'asset-2', type: 'image' })),
      importFromFile: vi.fn(async () => asset({ id: 'asset-2', type: 'image' })),
      replaceBytes: vi.fn(async () => asset({ id: 'asset-1', type: 'image' })),
    })

    const holdingPicture = () => ({
      ...catalog,
      find: vi.fn(async () => asset({ id: 'asset-1', type: 'image' })),
    })

    const layered = (over: Record<string, unknown> = {}) => ({
      name: 'Hero',
      document: {
        stack: {
          width: 1024,
          height: 768,
          nodes: [
            {
              kind: 'layer',
              name: 'Ink',
              src: 'data/p_ink.png',
              x: 0,
              y: 0,
              opacity: 1,
              visible: true,
              composite: 'svg:src-over',
            },
          ],
          studio: '{}',
        },
        surfaces: [
          { path: 'mergedimage.png', png: PNG_BYTES },
          { path: 'data/p_ink.png', png: PNG_BYTES },
        ],
      },
      ...over,
    })

    /**
     * The difference an open container buys, and the reason this channel exists beside
     * `savePicture`: a stack goes back over the file it came from, under the extension that
     * holds it, rather than being flattened into a PNG under the same name.
     */
    it('overwrites the file it came from, as a container', async () => {
      const assets = backend()
      registerProjectHandlers(deps(holdingPicture(), { assets }))

      await invoke(CHANNELS.assetsSaveLayered, layered({ replaces: 'asset-1' }))

      expect(assets.replaceBytes).toHaveBeenCalledWith(
        'asset-1',
        expect.any(Uint8Array),
        '.ora',
        expect.objectContaining({ width: 1024, height: 768 }),
      )
    })

    /** The dimensions come off the FLATTEN the container carries, which is what a tile shows. */
    it('files a copy beside its source, keeping them traceable to each other', async () => {
      const assets = backend()
      registerProjectHandlers(deps(holdingPicture(), { assets }))

      await invoke(CHANNELS.assetsSaveLayered, layered({ derivedFrom: 'asset-1' }))

      expect(assets.importFromBytes).toHaveBeenCalledWith(
        expect.objectContaining({ extension: '.ora', derivedFrom: 'asset-1', name: 'Hero' }),
        expect.any(Uint8Array),
      )
    })

    /** The same guard `savePicture` carries: an id naming a take would write over a recording. */
    it('refuses to overwrite a row that is not a picture', async () => {
      registerProjectHandlers(
        deps(
          { ...catalog, find: vi.fn(async () => asset({ id: 'asset-1', type: 'audio' })) },
          {
            assets: backend(),
          },
        ),
      )

      await expect(
        invoke(CHANNELS.assetsSaveLayered, layered({ replaces: 'asset-1' })),
      ).rejects.toThrow()
    })

    /** A path out of `data/` is a path out of the project folder once the container is unpacked. */
    it('refuses a layer whose file would land outside the container', async () => {
      registerProjectHandlers(deps(holdingPicture(), { assets: backend() }))

      const escaping = layered()
      escaping.document.stack.nodes[0]!.src = '../../etc/passwd.png'

      await expect(invoke(CHANNELS.assetsSaveLayered, escaping)).rejects.toThrow()
    })

    /** The same rule on the SURFACE, which is what actually becomes a ZIP entry. */
    it('refuses a surface whose entry would land outside the container', async () => {
      registerProjectHandlers(deps(holdingPicture(), { assets: backend() }))

      const escaping = layered()
      escaping.document.surfaces[1]!.path = '../../etc/passwd.png'

      await expect(invoke(CHANNELS.assetsSaveLayered, escaping)).rejects.toThrow()
    })
  })
})
