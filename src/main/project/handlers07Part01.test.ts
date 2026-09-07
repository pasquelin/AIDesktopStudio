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
  describe('a picture the editor edited', () => {
    const PNG = png(1024, 768)

    const PNG_BASE64 = PNG.toString('base64')

    const backend = () => ({
      importFromUrl: vi.fn(),
      importFromBytes: vi.fn(async () => asset({ id: 'asset-new', type: 'image' })),
      importFromFile: vi.fn(async () => asset({ id: 'asset-new', type: 'image' })),
      replaceBytes: vi.fn(async () => asset({ id: 'asset-1', type: 'image' })),
    })

    /**
     * A catalogue that answers with a picture, because an overwrite now asks it what it is about
     * to replace: the id travels in a JSON envelope inside the project folder, and `replaceBytes`
     * builds its path from the row's own type.
     */
    const holdingPicture = () => ({
      ...catalog,
      find: vi.fn(async () => asset({ id: 'asset-1', type: 'image' })),
    })
    // `replaces` overwrites, which is ⌘S on a tab opened from the shelf. Why it was refused for
    // a while is written where the rule lives: `LayerSurface.fromDocument`.
    it('overwrites the asset the caller names', async () => {
      const assets = backend()
      registerProjectHandlers(deps(holdingPicture(), { assets }))

      await invoke(CHANNELS.assetsSavePicture, {
        replaces: 'asset-1',
        name: 'Gemini 3.1',
        png: PNG_BASE64,
      })

      expect(assets.replaceBytes).toHaveBeenCalledWith('asset-1', PNG, '.png', {
        duration: 0,
        codec: 'png',
        width: 1024,
        height: 768,
      })
      expect(assets.importFromBytes).not.toHaveBeenCalled()
    })

    /**
     * The defect this closes destroyed a file and hid it. A 4112 × 2658 photo overwritten at
     * 1024² kept the probe of the picture that WAS there, so the inspector went on announcing
     * dimensions nothing on disk held — the one reader that could have shown the loss.
     */
    it('carries the dimensions of the bytes it writes, not those it replaces', async () => {
      const assets = backend()
      registerProjectHandlers(deps(holdingPicture(), { assets }))

      await invoke(CHANNELS.assetsSavePicture, {
        replaces: 'asset-1',
        name: 'Gemini 3.1',
        png: png(4112, 2658).toString('base64'),
      })

      expect(assets.replaceBytes).toHaveBeenCalledWith(
        'asset-1',
        expect.anything(),
        '.png',
        expect.objectContaining({ width: 4112, height: 2658 }),
      )
    })

    /**
     * A picture whose header will not read is still written — the bytes are what the user asked
     * to save, and `isPngBytes` already vouched for the signature.
     *
     * No probe is sent, which means `replaceBytes` KEEPS the previous one: it spreads the row it
     * found and only overwrites what it was given. That is the stale probe this lot closed, still
     * open on this one path — and deliberately, because the alternative is a row that claims a
     * picture has no dimensions at all. It is reachable only by bytes that open on a valid PNG
     * signature and then stop, which the studio's own encoder does not produce.
     */
    it('writes a picture whose header will not read, and sends no probe for it', async () => {
      const assets = backend()
      registerProjectHandlers(deps(holdingPicture(), { assets }))

      await invoke(CHANNELS.assetsSavePicture, {
        replaces: 'asset-1',
        name: 'Gemini 3.1',
        png: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64'),
      })

      expect(assets.replaceBytes).toHaveBeenCalledWith(
        'asset-1',
        expect.anything(),
        '.png',
        undefined,
      )
    })

    /**
     * The id travels in a JSON envelope inside the project folder — user territory, like the
     * manifest — and `replaceBytes` builds its path from the ROW's type. An id naming a take
     * would write `audio/<id>.png` and `rm` the `.wav` beside it, destroying a recording from a
     * save on another document entirely.
     */
    it('refuses to overwrite an asset that is not a picture', async () => {
      const assets = backend()
      const holdingTake = { ...catalog, find: vi.fn(async () => asset({ type: 'audio' })) }
      registerProjectHandlers(deps(holdingTake, { assets }))

      await expect(
        invoke(CHANNELS.assetsSavePicture, {
          replaces: 'asset-1',
          name: 'Gemini 3.1',
          png: PNG_BASE64,
        }),
      ).rejects.toThrow()
      expect(assets.replaceBytes).not.toHaveBeenCalled()
    })

    // The bytes are checked before anything is written, so a payload that is not a picture cannot
    // destroy the one it claims to replace.
    it('refuses to overwrite with bytes that are not a picture', async () => {
      const assets = backend()
      registerProjectHandlers(deps(catalog, { assets }))

      await expect(
        invoke(CHANNELS.assetsSavePicture, {
          replaces: 'asset-1',
          name: 'Gemini 3.1',
          png: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]).toString('base64'),
        }),
      ).rejects.toThrow()
      expect(assets.replaceBytes).not.toHaveBeenCalled()
    })

    it('files it beside its source', async () => {
      const assets = backend()
      registerProjectHandlers(deps(catalog, { assets }))

      await invoke(CHANNELS.assetsSavePicture, {
        name: 'Gemini 3.1 copie',
        derivedFrom: 'asset-1',
        png: PNG_BASE64,
      })

      expect(assets.importFromBytes).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'image',
          extension: '.png',
          derivedFrom: 'asset-1',
          probe: expect.objectContaining({ width: 1024, height: 768 }),
        }),
        PNG,
      )
    })

    /**
     * A channel edited as a picture is still a channel. Read from the catalogue rather
     * than sent by the renderer, for the reason `saveTexture` gives: the kind is what the folder
     * and the extension follow, and a channel filed as a plain picture leaves its shelf.
     */
    it('gives a derived picture the kind and the channel of its source', async () => {
      const assets = backend()
      const sourced = {
        ...catalog,
        find: vi.fn(async () => asset({ id: 'asset-1', type: 'image', map: 'normal' })),
      }
      registerProjectHandlers(deps(sourced, { assets }))

      await invoke(CHANNELS.assetsSavePicture, {
        name: 'Brique — Normale copie',
        derivedFrom: 'asset-1',
        png: PNG_BASE64,
      })

      expect(assets.importFromBytes).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'image', map: 'normal' }),
        expect.anything(),
      )
    })

    it('never hands back where the file sits', async () => {
      const assets = backend()
      assets.replaceBytes = vi.fn(async () =>
        asset({ id: 'asset-1', type: 'image', sourcePath: '/Users/someone/secret.png' }),
      )
      registerProjectHandlers(deps(holdingPicture(), { assets }))

      const saved = await invoke(CHANNELS.assetsSavePicture, {
        replaces: 'asset-1',
        name: 'Gemini 3.1',
        png: PNG_BASE64,
      })

      expect(saved).toEqual(expect.not.objectContaining({ sourcePath: expect.anything() }))
    })
  })
})
