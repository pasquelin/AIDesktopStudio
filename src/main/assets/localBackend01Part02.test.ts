import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AssetType } from '@shared/domain/asset'
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

  it('re-suffixes the file it already has rather than laying a second one beside it', async () => {
    await backend.importFromBytes(
      { id: 'asset_2', name: 'Prise', type: 'audio', extension: '.mp3' },
      new Uint8Array([1]),
    )

    const rewritten = await backend.importFromUrl({
      id: 'asset_2',
      url: 'https://cdn.example/take.wav',
      name: 'Prise',
      type: 'audio',
    })

    expect(rewritten.path).toBe('Audio/Prise.wav')
  })

  /**
   * A generation made on this machine is already a file: reading it to write it back put video,
   * audio, meshes and panoramas through the main process's heap whole, twice.
   */
  it('moves a file already on this machine instead of copying its bytes through', async () => {
    const source = join(root, 'handover.png')
    await writeFile(source, BYTES)

    const asset = await backend.importFromFile(
      { id: 'asset_1', name: 'Cube', type: 'image', extension: '.png' },
      source,
    )

    expect(asset.path).toBe('Images/Cube.png')
    expect(await readFile(join(root, asset.path ?? ''))).toEqual(Buffer.from(BYTES))
    // The length comes off the file that landed, there being no buffer to measure.
    expect(asset.bytes).toBe(BYTES.byteLength)
    await expect(readFile(source)).rejects.toThrow()
  })

  // One folder per kind, and the catalogue reads a channel off the row rather than off the folder.
  it('files each kind under its own folder', async () => {
    const landed = async (type: AssetType): Promise<string | undefined> => {
      const asset = await backend.importFromBytes(
        { id: `asset_${type}`, name: 'Prise', type, extension: '.bin' },
        BYTES,
      )
      return asset.path
    }

    expect(await landed('mesh')).toBe('Modelling/Models/Prise.bin')
    expect(await landed('audio')).toBe('Audio/Prise.bin')
    expect(await landed('skybox')).toBe('Skyboxes/Prise.bin')
  })

  /**
   * A job of four outputs lands four times under one prompt, and there is nobody to ask. The
   * suffix is the studio's own doing — a name a user typed is refused instead.
   */
  it('suffixes a second asset that would land on the same file', async () => {
    const first = await backend.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/a.png',
      name: 'Ruelle bleue',
      type: 'image',
    })
    const second = await backend.importFromUrl({
      id: 'asset_2',
      url: 'https://cdn.example/b.png',
      name: 'Ruelle bleue',
      type: 'image',
    })

    expect(first.path).toBe('Images/Ruelle bleue.png')
    expect(second.path).toBe('Images/Ruelle bleue 2.png')
  })

  it('keeps what the request says nothing about', async () => {
    await catalog.add({
      id: 'asset_1',
      name: 'Take',
      type: 'audio',
      location: 'local',
      tags: [],
      createdAt: '2026-08-01T09:00:00.000Z',
      hash: 'abc123',
      peaksPath: '.index/peaks/abc123.bin',
    })

    const rewritten = await backend.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/take.wav',
      name: 'Take',
      type: 'audio',
    })

    expect(rewritten.peaksPath).toBe('.index/peaks/abc123.bin')
    // Not among them: the file was written again, so the fingerprint describes what is on the
    // disk now rather than what the row remembered.
    expect(rewritten.hash).toBe(await hashSource(join(root, 'Audio/Take.wav')))
  })

  it('records everything a generation reported about an import', async () => {
    const generation = { modelId: 'model_flux', modelLabel: 'Flux', prompt: 'moss', params: {} }
    const asset = await backend.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/render.png',
      name: 'Albedo',
      type: 'image',
      jobId: 'job_1',
      remoteAssetId: 'asset_remote',
      remoteOwnerId: 'proj_a',
      remoteUpdatedAt: '2026-08-06T09:00:00.000Z',
      groupId: 'job_1',
      outputIndex: 0,
      generation,
      derivedFrom: 'asset_source',
      map: 'baseColor',
      mapInverted: true,
    })

    expect(asset).toMatchObject({
      groupId: 'job_1',
      outputIndex: 0,
      generation,
      derivedFrom: 'asset_source',
      map: 'baseColor',
      mapInverted: true,
      remoteOwnerId: 'proj_a',
      remoteUpdatedAt: '2026-08-06T09:00:00.000Z',
    })
  })

  it('keeps an extracted packed map in the materials folder and catalogue row', async () => {
    const asset = await backend.importFromBytes(
      {
        id: 'asset_orm',
        name: 'Robot — metallicRoughnessTexture',
        type: 'image',
        extension: '.png',
        packedSlot: 'metallicRoughnessTexture',
      },
      BYTES,
    )

    expect(asset.path).toBe('Materials/Robot — metallicRoughnessTexture.png')
    expect(asset.packedSlot).toBe('metallicRoughnessTexture')
  })

  /**
   * What the app SHIPS lands under the studio's own folder rather than in the user's tree — the
   * default role path inside it, never the resolved one, the studio owning that folder.
   */
  it('files what the app ships under the resources folder, in the role’s own tree', async () => {
    const asset = await backend.importFromBytes(
      {
        id: 'asset_grid',
        name: 'GridLarge',
        type: 'image',
        extension: '.png',
        map: 'baseColor',
        resource: true,
      },
      BYTES,
    )

    expect(asset.path).toBe('.resources/Materials/GridLarge.png')
  })

  it('files an extracted model map with images while keeping its channel metadata', async () => {
    const asset = await backend.importFromBytes(
      {
        id: 'asset_model_map',
        name: 'Robot — Normal',
        type: 'image',
        extension: '.png',
        map: 'normal',
        folderRole: 'image',
      },
      BYTES,
    )

    expect(asset.path).toBe('Images/Robot — Normal.png')
    expect(asset.map).toBe('normal')
  })

  it("records a generation's remote id without counting it as synced", async () => {
    const asset = await backend.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/render.png',
      name: 'Boulder',
      type: 'image',
      remoteAssetId: 'asset_remote',
      sync: false,
    })

    expect(asset.remoteAssetId).toBe('asset_remote')
    expect(asset.syncStatus).toBeUndefined()
    // Same clock as `localChangedAt`, so the library page does not read as a conflict and a
    // follow-up generation reuses the id rather than pushing a duplicate.
    expect(asset.remoteSyncedAt).toBe('2026-08-06T10:00:00.000Z')
  })

  // Downloaded from the very twin it points at: the two cannot differ yet.
  it('counts an imported asset as settled with its twin', async () => {
    const asset = await backend.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/render.png',
      name: 'Boulder',
      type: 'image',
      remoteAssetId: 'asset_remote',
    })

    expect(asset).toMatchObject({
      syncStatus: 'synced',
      remoteSyncedAt: '2026-08-06T10:00:00.000Z',
      localChangedAt: '2026-08-06T10:00:00.000Z',
    })
  })

  it('leaves a file that came from nowhere in particular without a twin', async () => {
    const asset = await backend.importFromUrl({
      id: 'asset_1',
      url: 'https://cdn.example/render.png',
      name: 'Boulder',
      type: 'image',
    })

    expect(asset.syncStatus).toBeUndefined()
    expect(asset.remoteSyncedAt).toBeUndefined()
    expect(asset.groupId).toBeUndefined()
    expect(asset.outputIndex).toBeUndefined()
  })

  /**
   * The channel is what files it there, and it is all that is left to: a picture of a surface has
   * been an ordinary `image` since the studio stopped giving one a kind of its own, so nothing
   * else tells seven channels of one material from seven photographs.
   */
})
