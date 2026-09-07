import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'

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

import { glbFile, glbWearing } from '@main/assets/glb-fixtures'
import { embeddedTextures } from '@main/assets/glbTextures'

import { ownFileOf } from '@main/assets/protocol'

import { createTextureExtraction } from '@main/assets/textureExtraction'
import type { WriteRequest } from '@main/assets/localBackend'

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
        replaceModel: async (source, bytes) => {
          await merged.assets.replaceBytes(source.id, bytes, '.glb')
        },
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
   * A downloaded model keeps its pictures inside its own file, where nothing in the studio can
   * open them. Taking them out is what makes them assets — and what lets the maps of a model
   * fetched from the library be painted on at all.
   */
  describe('the pictures inside a model', () => {
    const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])

    const backend = () => ({
      importFromUrl: vi.fn(),
      importFromBytes: vi.fn<(request: WriteRequest, bytes: Uint8Array) => Promise<Asset>>(
        async () => asset({ id: 'asset-new', type: 'image' }),
      ),
      importFromFile: vi.fn(async () => asset({ id: 'asset-new', type: 'image' })),
      replaceBytes: vi.fn(),
    })

    const glbWithTwoPictures = (): Uint8Array => {
      const normal = new Uint8Array([9, 8, 7, 6])
      return glbFile(
        {
          materials: [
            {
              pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
              normalTexture: { index: 1 },
            },
          ],
          textures: [{ source: 0 }, { source: 1 }],
          images: [
            { bufferView: 0, mimeType: 'image/jpeg' },
            { bufferView: 1, mimeType: 'image/jpeg' },
          ],
          bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: JPEG.byteLength },
            { buffer: 0, byteOffset: JPEG.byteLength, byteLength: normal.byteLength },
          ],
        },
        new Uint8Array([...JPEG, ...normal]),
      )
    }

    /**
     * What one call wrote, with the bytes as plain numbers: the reader hands back views ONTO the
     * file it read — a `Buffer`, since that is what `readFile` answers — and a deep equality
     * against a `Uint8Array` compares the two wrappers rather than the pixels.
     */
    const wrote = (assets: ReturnType<typeof backend>, at = 0) => {
      const call: unknown[] = assets.importFromBytes.mock.calls[at] ?? []
      const bytes = call[1]

      return {
        request: call[0],
        bytes: bytes instanceof Uint8Array ? [...bytes] : [],
      }
    }

    /** The model on disk, under a project folder this test owns. */
    async function modelInProject(file: Uint8Array, name = 'Skeleton'): Promise<string> {
      const root = await mkdtemp(join(tmpdir(), 'scenario-extract-'))
      await mkdir(join(root, 'assets/3d'), { recursive: true })
      await writeFile(join(root, 'assets/3d/asset-1.glb'), file)

      await catalog.add(
        asset({
          id: 'asset-1',
          name,
          type: 'mesh',
          path: 'assets/3d/asset-1.glb',
          modelMaterialIds: ['material-1'],
        }),
      )
      return root
    }

    it('writes each one into the project as a picture of its own', async () => {
      const root = await modelInProject(glbWearing('baseColorTexture', JPEG))
      const assets = backend()
      registerProjectHandlers(
        deps(catalog, { assets, project: projectAt(root, catalog), newAssetId: () => 'asset-new' }),
      )

      await invoke(CHANNELS.assetsExtractTextures, 'asset-1')

      expect(wrote(assets).request).toMatchObject({
        id: 'asset-new',
        type: 'image',
        // Read here because this is the only place the extracted name reaches: it carries TWO
        // holes, and nothing else in the suite would notice `{{name}} — {{channel}}` going out
        // whole. See `main/no-unfilled-placeholder.test.ts`.
        name: 'Skeleton — Couleur de base',
        // The channel the glTF slot means, so the shelf can badge it and the catalogue answer
        // "which base colours does this project hold".
        map: 'baseColor',
        // `.jpg`, from what the file declares: the bytes are copied, so the name must not lie.
        extension: '.jpg',
        derivedFrom: 'asset-1',
        outputIndex: 0,
        folderRole: 'image',
      })
      expect(wrote(assets).bytes).toEqual([...JPEG])
      const replacement = assets.replaceBytes.mock.calls[0]?.[1]
      expect(replacement).toBeInstanceOf(Uint8Array)
      if (replacement instanceof Uint8Array) expect(embeddedTextures(replacement)).toEqual([])
      await rm(root, { recursive: true, force: true })
    })

    it('reuses a texture that was already extracted, then strips the model copy', async () => {
      const root = await modelInProject(glbWearing('baseColorTexture', JPEG))
      await catalog.add(
        asset({
          id: 'asset-tex',
          type: 'image',
          derivedFrom: 'asset-1',
          name: 'Skeleton base',
          map: 'baseColor',
        }),
      )
      const assets = backend()
      registerProjectHandlers(deps(catalog, { assets, project: projectAt(root, catalog) }))

      const answered = await invoke(CHANNELS.assetsExtractTextures, 'asset-1')

      expect(assets.importFromBytes).not.toHaveBeenCalled()
      expect(assets.replaceBytes).toHaveBeenCalledTimes(1)
      expect(answered).toMatchObject([{ id: 'asset-tex' }])
      await rm(root, { recursive: true, force: true })
    })

    it('ignores another derived image that is not an extracted material texture', async () => {
      const root = await modelInProject(glbWearing('baseColorTexture', JPEG))
      await catalog.add(
        asset({ id: 'asset-preview', type: 'image', derivedFrom: 'asset-1', name: 'Preview' }),
      )
      const assets = backend()
      registerProjectHandlers(deps(catalog, { assets, project: projectAt(root, catalog) }))

      await invoke(CHANNELS.assetsExtractTextures, 'asset-1')

      expect(assets.importFromBytes).toHaveBeenCalledTimes(1)
      expect(assets.replaceBytes).toHaveBeenCalledTimes(1)
      await rm(root, { recursive: true, force: true })
    })

    it('resumes after a partial write before stripping the model', async () => {
      const root = await modelInProject(glbWithTwoPictures())
      const assets = backend()
      let calls = 0
      assets.importFromBytes.mockImplementation(async request => {
        calls += 1
        if (calls === 2) throw new Error('disk full')
        const written = asset({
          id: request.id,
          name: request.name,
          type: 'image',
          derivedFrom: request.derivedFrom,
          outputIndex: request.outputIndex,
          map: request.map,
          packedSlot: request.packedSlot,
        })
        await catalog.add(written)
        return written
      })
      registerProjectHandlers(deps(catalog, { assets, project: projectAt(root, catalog) }))

      await expect(invoke(CHANNELS.assetsExtractTextures, 'asset-1')).rejects.toThrow('disk full')
      expect(assets.replaceBytes).not.toHaveBeenCalled()

      await invoke(CHANNELS.assetsExtractTextures, 'asset-1')

      expect(assets.importFromBytes).toHaveBeenCalledTimes(3)
      expect(assets.replaceBytes).toHaveBeenCalledTimes(1)
      await rm(root, { recursive: true, force: true })
    })

    /**
     * The catalogue can only answer for what is COMMITTED, and reading a real model then writing
     * its pictures takes seconds: the automatic run and the menu row clicked while it was going
     * both saw a mesh with no derived picture — which it was, for a few seconds more.
     */
    it('shares a run already going rather than extracting the same model twice', async () => {
      const root = await modelInProject(glbWearing('baseColorTexture', JPEG))
      const assets = backend()
      const merged = deps(catalog, {
        assets,
        project: projectAt(root, catalog),
        newAssetId: () => 'asset-new',
      })
      registerProjectHandlers(merged)

      const [first, second] = await Promise.all([
        invoke(CHANNELS.assetsExtractTextures, 'asset-1'),
        invoke(CHANNELS.assetsExtractTextures, 'asset-1'),
      ])

      expect(assets.importFromBytes).toHaveBeenCalledTimes(1)
      expect(second).toEqual(first)
      await rm(root, { recursive: true, force: true })
    })

    // Named as a derived channel is, and in the language the window is in — the two are the same
    // thing on the shelf and must not read as two different notions.
    it('names it after the model and the role it played', async () => {
      const root = await modelInProject(glbWearing('baseColorTexture', JPEG), 'Squelette')
      const assets = backend()
      registerProjectHandlers(deps(catalog, { assets, project: projectAt(root, catalog) }))

      await invoke(CHANNELS.assetsExtractTextures, 'asset-1')

      expect(wrote(assets).request).toMatchObject({ name: 'Squelette — Couleur de base' })
      await rm(root, { recursive: true, force: true })
    })

    // Nothing appears on the shelf, so a gesture that says nothing reads as a broken menu row.
    it('says so when the model carries no picture at all', async () => {
      const root = await modelInProject(glbFile({ materials: [{ name: 'bare' }] }))
      const record = vi.fn()
      registerProjectHandlers(
        deps(catalog, { assets: backend(), project: projectAt(root, catalog), record }),
      )

      await expect(invoke(CHANNELS.assetsExtractTextures, 'asset-1')).resolves.toEqual([])
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ messageKey: 'activity.extractedNothing' }),
      )
      await rm(root, { recursive: true, force: true })
    })

    it('counts what it took out in the journal', async () => {
      const root = await modelInProject(glbWearing('baseColorTexture', JPEG))
      const record = vi.fn()
      registerProjectHandlers(
        deps(catalog, { assets: backend(), project: projectAt(root, catalog), record }),
      )

      await invoke(CHANNELS.assetsExtractTextures, 'asset-1')

      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          messageKey: 'activity.extractedTextures',
          params: { count: 1, name: 'Skeleton' },
        }),
      )
      await rm(root, { recursive: true, force: true })
    })

    /**
     * The picture glTF packs two channels into: roughness in green, metalness in blue. The
     * studio stores those apart, so it comes out unlabelled — still openable, still paintable,
     * just not claiming to be a channel it is not. A PNG also answers for its own dimensions.
     */
    it('files a packed picture without a channel, and reads a PNG for its size', async () => {
      const png = pngBytes({ width: 8, height: 4 })
      const root = await modelInProject(glbWearing('metallicRoughnessTexture', png, 'image/png'))
      const assets = backend()
      registerProjectHandlers(deps(catalog, { assets, project: projectAt(root, catalog) }))

      await invoke(CHANNELS.assetsExtractTextures, 'asset-1')

      expect(wrote(assets).request).toMatchObject({
        type: 'image',
        extension: '.png',
        probe: expect.objectContaining({ width: 8, height: 4 }),
      })
      // Neither roughness nor metalness: the picture holds both, and claiming one would label
      // the pixels wrongly.
      expect(wrote(assets).request).not.toHaveProperty('map')
      await rm(root, { recursive: true, force: true })
    })

    // A row whose file the disk no longer has: there is nothing to read the pictures out of.
    it('refuses a model with no file behind it', async () => {
      await catalog.add(asset({ id: 'asset-3', name: 'Ghost', type: 'mesh' }))
      registerProjectHandlers(deps(catalog, { assets: backend() }))

      await expect(invoke(CHANNELS.assetsExtractTextures, 'asset-3')).rejects.toThrow()
    })

    // Only a mesh holds pictures inside itself, and the id comes from the renderer.
    it('refuses an asset that is not a model', async () => {
      await catalog.add(asset({ id: 'asset-2', type: 'image', path: 'assets/img/asset-2.png' }))
      registerProjectHandlers(deps(catalog, { assets: backend() }))

      await expect(invoke(CHANNELS.assetsExtractTextures, 'asset-2')).rejects.toThrow()
      await expect(invoke(CHANNELS.assetsExtractTextures, 'asset-gone')).rejects.toThrow()
    })
  })
})
