import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AsyncCatalog } from '@main/project/catalogClient'
// `hashOrNull` where the backend is wired, `hashSource` where a test states the value it expects:
// the first is what production injects, the second is the same answer without the `null` arm.
import { hashOrNull, hashSource } from '@main/media/runner'
import { memoryCatalog } from '@main/project/catalog-fixtures'
import { roleFolderAt } from '@main/project/project-fixtures'
import { createLocalBackend, type LocalBackend } from './localBackend'

const BYTES = new Uint8Array([1, 2, 3, 4])

describe('local backend', () => {
  let root: string
  let catalog: AsyncCatalog
  let backend: LocalBackend

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'scenario-assets-'))
    // No landing folder is laid down: a role's folder is a default, not a layout, and every
    // import below writes into one that has to be created on the way. A user who threw `Images/`
    // away gets it back rather than an import that fails.
    await mkdir(join(root, '.index/posters'), { recursive: true })

    catalog = memoryCatalog()
    backend = createLocalBackend({
      download: () => Promise.resolve(BYTES),
      projectPath: () => root,
      folderFor: roleFolderAt(root),
      catalog: () => catalog,
      now: () => '2026-08-06T10:00:00.000Z',
      hash: hashOrNull,
    })
  })

  afterEach(async () => {
    await catalog.close()
    await rm(root, { recursive: true, force: true })
  })

  it('lands a picture that holds a channel with the materials', async () => {
    const asset = await backend.importFromUrl({
      id: 'asset_map',
      url: 'https://cdn.example/normal.png',
      name: 'Rouille',
      type: 'image',
      map: 'normal',
    })

    expect(asset.path).toBe('Materials/Rouille.png')
  })

  it('writes the file to disk and indexes it', async () => {
    const asset = await backend.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/render.png',
      name: 'Boulder',
      type: 'image',
      jobId: 'job_1',
      remoteAssetId: 'asset_remote',
    })

    expect(asset).toMatchObject({
      id: 'asset_1',
      location: 'local',
      // The name, never the id: a folder of `asset_40f76c36-8ad4-….png` says nothing about
      // what is in it, and the row that does say could not be joined to it by eye.
      path: 'Images/Boulder.png',
      bytes: 4,
      jobId: 'job_1',
      remoteAssetId: 'asset_remote',
    })

    expect(await readFile(join(root, 'Images/Boulder.png'))).toEqual(Buffer.from(BYTES))
    await expect(catalog.find('asset_1')).resolves.toEqual(asset)
  })

  /**
   * Measured on the running app before this existed: a picture pulled from the library, moved out
   * of `Images/` with the Finder, was DATED rather than followed — the rescan looks a lost row up
   * by its fingerprint, and every row that came through this door carried none. Only a file picked
   * off a disk was ever fingerprinted, by the ingest, and that is not how assets reach a project
   * here: they are generated or pulled.
   *
   * Compared against `hashSource` itself rather than against a literal, because the value proves
   * nothing on its own — what matters is that it is the SAME one the rescan will compute.
   */
  it('fingerprints the file it wrote, so a rescan can follow it when the user files it away', async () => {
    const asset = await backend.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/render.png',
      name: 'Boulder',
      type: 'image',
    })

    expect(asset.hash).toBe(await hashSource(join(root, 'Images/Boulder.png')))
  })

  /**
   * The one door every asset comes through, which is why extracting a model's pictures hangs off
   * it rather than off each import site. Told AFTER the catalogue holds the row: a listener that
   * goes looking for what just arrived — that extraction does exactly that — would find nothing.
   */
  it('says what landed, once the catalogue can answer for it', async () => {
    // The look-up is STARTED from the listener and awaited from the body: an `async` listener's
    // promise is dropped — `onImported` answers `void` — so an expectation inside one would
    // reject into the void and the case would pass on the very regression it guards.
    const asked: Promise<unknown>[] = []
    const watched = createLocalBackend({
      download: () => Promise.resolve(BYTES),
      projectPath: () => root,
      folderFor: roleFolderAt(root),
      catalog: () => catalog,
      now: () => '2026-08-06T10:00:00.000Z',
      hash: hashOrNull,
      onImported: imported => {
        asked.push(catalog.find(imported.id))
      },
    })

    await watched.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/tree.glb',
      name: 'Tree',
      type: 'mesh',
    })

    expect(await Promise.all(asked)).toEqual([expect.objectContaining({ id: 'asset_1' })])
  })

  /**
   * The deps say a listener that throws must not cost the asset, and the row is committed by the
   * time one is called: an import reported as failed for an asset the project holds is worse
   * than the errand that failed.
   */
  it('keeps the import when a listener throws', async () => {
    const watched = createLocalBackend({
      download: () => Promise.resolve(BYTES),
      projectPath: () => root,
      folderFor: roleFolderAt(root),
      catalog: () => catalog,
      now: () => '2026-08-06T10:00:00.000Z',
      hash: hashOrNull,
      onImported: () => {
        throw new Error('a listener that has its own troubles')
      },
    })

    await watched.importFromUrl({
      id: 'asset_2',
      url: 'https://cdn.example/tree.glb',
      name: 'Tree',
      type: 'mesh',
    })

    await expect(catalog.find('asset_2')).resolves.not.toBeNull()
  })

  it('indexes nothing when the download fails', async () => {
    const failing = createLocalBackend({
      download: vi.fn(() => Promise.reject(new Error('offline'))),
      projectPath: () => root,
      folderFor: roleFolderAt(root),
      catalog: () => catalog,
      now: () => '2026-08-06T10:00:00.000Z',
      hash: hashOrNull,
    })

    await expect(
      failing.importFromUrl({
        id: 'asset_1',
        url: 'https://cdn.example/render.png',
        name: 'Boulder',
        type: 'image',
      }),
    ).rejects.toThrow('offline')

    // An asset in the catalogue with no file behind it is worse than no asset at all.
    await expect(catalog.find('asset_1')).resolves.toBeNull()
  })
})
