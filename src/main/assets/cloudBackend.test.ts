import { localizedError } from '@shared/localizedError'
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type { CloudAsset } from '@shared/domain/cloudAsset'
import type { AsyncCatalog } from '@main/project/catalogClient'
import type { RemoteAssetCatalog } from '@main/provider/assetCatalog'
import { memoryCatalog } from '@main/project/catalog-fixtures'
import { createCloudBackend, type CloudBackendDeps } from './cloudBackend'
import type { ImportRequest, LocalBackend } from './localBackend'

const SMALL_LIMIT = 6 * 1024 * 1024

function cloudAsset(overrides: Partial<CloudAsset> = {}): CloudAsset {
  return {
    id: 'remote_1',
    name: 'Boulder',
    type: 'image',
    remoteType: 'txt2img',
    ownerId: 'proj_a',
    createdAt: '2026-08-06T10:00:00.000Z',
    updatedAt: '2026-08-06T10:00:00.000Z',
    privacy: 'private',
    tags: [],
    collectionIds: [],
    ...overrides,
  }
}

type Harness = {
  backend: ReturnType<typeof createCloudBackend>
  catalog: AsyncCatalog
  imported: ImportRequest[]
  downloads: { assetId: string; format?: string }[]
  multiparts: unknown[]
  smalls: { name: string; base64: string }[]
}

function harness(overrides: Partial<CloudBackendDeps> = {}): Harness {
  const catalog = memoryCatalog()
  onTestFinished(catalog.close)
  const imported: ImportRequest[] = []
  const downloads: { assetId: string; format?: string }[] = []
  const multiparts: unknown[] = []
  const smalls: { name: string; base64: string }[] = []

  const local: LocalBackend = {
    importFromFile: () => Promise.reject(new Error('a twin is downloaded, never moved')),
    importFromUrl: async request => {
      imported.push(request)
      const asset: Asset = {
        id: request.id,
        name: request.name,
        type: request.type,
        location: 'local',
        path: `assets/img/${request.id}.png`,
        tags: [],
        createdAt: '2026-08-06T10:00:00.000Z',
        ...(request.remoteAssetId ? { remoteAssetId: request.remoteAssetId } : {}),
      }
      return await catalog.add(asset)
    },
    importFromBytes: () => Promise.reject(new Error('not used')),
    replaceBytes: () => Promise.reject(new Error('not used')),
  }

  const remote: RemoteAssetCatalog = {
    list: () => Promise.resolve({ assets: [], token: null }),
    search: () => Promise.resolve({ assets: [], token: null }),
    getBulk: () => Promise.resolve([]),
    updateTags: () => Promise.resolve(),
    deleteMany: () => Promise.resolve(),
    downloadUrl: (assetId, format) => {
      downloads.push({ assetId, ...(format ? { format } : {}) })
      return Promise.resolve(`https://cdn/fresh/${assetId}`)
    },
  }

  const backend = createCloudBackend({
    remote: () => remote,
    local,
    catalog: () => catalog,
    multipart: params => {
      multiparts.push(params)
      return Promise.resolve({ assetId: 'remote_big', ownerId: 'proj_a', updatedAt: 'T1' })
    },
    small: (name, base64) => {
      smalls.push({ name, base64 })
      return Promise.resolve('remote_small')
    },
    fileOf: asset => (asset.path ? `/project/${asset.path}` : (asset.sourcePath ?? null)),
    readFile: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    sizeOf: () => Promise.resolve(3),
    newId: () => 'asset_new',
    now: () => '2026-08-06T12:00:00.000Z',
    smallUploadLimit: SMALL_LIMIT,
    ...overrides,
  })

  return { backend, catalog, imported, downloads, multiparts, smalls }
}

describe('bringing an asset down', () => {
  it('asks for a fresh URL rather than trusting the one the listing carried', async () => {
    const { backend, downloads } = harness()
    await backend.pull(cloudAsset())

    // The URL an asset arrives with is signed and expires; a listing held a minute may carry
    // one that will not survive the download.
    expect(downloads).toEqual([{ assetId: 'remote_1' }])
  })

  it('asks the CDN to convert a mesh, since the scene only loads glb', async () => {
    const { backend, downloads } = harness()
    await backend.pull(cloudAsset({ type: 'mesh' }))

    expect(downloads).toEqual([{ assetId: 'remote_1', format: 'glb' }])
  })

  it('leaves a picture in the format it was made in', async () => {
    const { backend, downloads } = harness()
    await backend.pull(cloudAsset({ type: 'image' }))

    expect(downloads[0]?.format).toBeUndefined()
  })

  it('carries the twin and its provenance into the project', async () => {
    const generation = { modelId: 'model_flux', modelLabel: 'Flux', prompt: 'moss', params: {} }
    const { backend, imported } = harness()
    await backend.pull(cloudAsset({ generation }))

    expect(imported[0]).toMatchObject({
      remoteAssetId: 'remote_1',
      remoteOwnerId: 'proj_a',
      remoteUpdatedAt: '2026-08-06T10:00:00.000Z',
      generation,
    })
  })

  /**
   * The channel is what files a picture with the materials rather than with the photographs, and
   * the provenance is the only thing that carries it. Dropped here, a channel pulled from the
   * Library lands beside the photographs while its twin generated in the app lands with the
   * materials — one picture, two folders, on the door it came through alone.
   */
  it('carries the channel a pulled picture serves, read off its provenance', async () => {
    const { backend, imported } = harness()
    await backend.pull(cloudAsset({ remoteType: 'texture-smoothness' }))

    expect(imported[0]).toMatchObject({ map: 'roughness', mapInverted: true })
  })

  it('claims no channel for a picture no material asked for', async () => {
    const { backend, imported } = harness()
    await backend.pull(cloudAsset({ remoteType: 'txt2img' }))

    expect(imported[0]?.map).toBeUndefined()
  })

  /**
   * The tile the user was looking at one gesture earlier. Dropped here, a mesh downloaded from
   * the library turns into an icon on arrival, with the picture still sitting on the CDN.
   */
  it('carries the still the library was already showing', async () => {
    const { backend, imported } = harness()
    await backend.pull(cloudAsset({ type: 'mesh', thumbnailUrl: 'https://cdn/thumbnails/rem_1' }))

    expect(imported[0]?.thumbnailUrl).toBe('https://cdn/thumbnails/rem_1')
  })

  it('carries none when the library has none', async () => {
    const { backend, imported } = harness()
    await backend.pull(cloudAsset({ type: 'mesh', thumbnailUrl: undefined }))

    expect(imported[0]?.thumbnailUrl).toBeUndefined()
  })

  it('refreshes the row it already has rather than making a second one', async () => {
    const { backend, catalog, imported } = harness()
    await catalog.add({
      id: 'asset_existing',
      name: 'Boulder',
      type: 'image',
      location: 'local',
      remoteAssetId: 'remote_1',
      tags: [],
      createdAt: '2026-08-05T10:00:00.000Z',
    })

    await backend.pull(cloudAsset())
    expect(imported[0]?.id).toBe('asset_existing')
  })
})

describe('sending an asset up', () => {
  const localAsset = (overrides: Partial<Asset> = {}): Asset => ({
    id: 'asset_1',
    name: 'Boulder',
    type: 'image',
    location: 'local',
    path: 'assets/img/asset_1.png',
    tags: [],
    createdAt: '2026-08-06T10:00:00.000Z',
    ...overrides,
  })

  let harnessed: Harness

  beforeEach(() => {
    harnessed = harness()
  })

  it('sends a small picture as base64, the path that needs no multipart', async () => {
    await harnessed.catalog.add(localAsset())
    await harnessed.backend.push('asset_1')

    expect(harnessed.smalls).toHaveLength(1)
    expect(harnessed.multiparts).toHaveLength(0)
  })

  it('sends a video through multipart whatever its size, since base64 is images only', async () => {
    await harnessed.catalog.add(localAsset({ type: 'video', path: 'assets/vid/asset_1.mp4' }))
    await harnessed.backend.push('asset_1')

    expect(harnessed.multiparts[0]).toMatchObject({
      file: '/project/assets/vid/asset_1.mp4',
      contentType: 'video/mp4',
      kind: 'video',
    })
  })

  it('never reads a file it is only going to stream', async () => {
    // The multipart helper takes a path and streams it: reading here would pull a two-gigabyte
    // rush into the main process to throw it away, once per asset of a two-hundred-long push.
    let read = false
    const streamed = harness({
      readFile: () => {
        read = true
        return Promise.resolve(new Uint8Array())
      },
    })
    await streamed.catalog.add(localAsset({ type: 'video', path: 'assets/vid/asset_1.mp4' }))
    await streamed.backend.push('asset_1')

    expect(streamed.multiparts).toHaveLength(1)
    expect(read).toBe(false)
  })

  it('trusts the size the catalogue already knows rather than asking the disk', async () => {
    let stated = false
    const known = harness({
      sizeOf: () => {
        stated = true
        return Promise.resolve(1)
      },
    })
    await known.catalog.add(localAsset({ bytes: SMALL_LIMIT + 1 }))
    await known.backend.push('asset_1')

    expect(stated).toBe(false)
    expect(known.multiparts).toHaveLength(1)
  })

  it('asks the disk for a linked media whose row predates the column', async () => {
    const linked = harness({ sizeOf: () => Promise.resolve(10) })
    await linked.catalog.add(localAsset({ bytes: undefined }))
    await linked.backend.push('asset_1')

    expect(linked.smalls).toHaveLength(1)
  })

  it('sends a picture too large for one request through multipart', async () => {
    const big = harness({ sizeOf: () => Promise.resolve(SMALL_LIMIT + 1) })
    await big.catalog.add(localAsset())
    await big.backend.push('asset_1')

    expect(big.smalls).toHaveLength(0)
    expect(big.multiparts).toHaveLength(1)
  })

  it('records the twin it became, and that both sides now agree', async () => {
    await harnessed.catalog.add(localAsset({ syncError: 'upload-too-large' }))
    const pushed = await harnessed.backend.push('asset_1')

    expect(pushed).toMatchObject({
      remoteAssetId: 'remote_small',
      syncStatus: 'synced',
      remoteSyncedAt: '2026-08-06T12:00:00.000Z',
    })
    // The old failure goes with the success, or the badge keeps explaining what no longer happens.
    expect(pushed.syncError).toBeUndefined()
  })

  it('sends a linked rush from where it lies rather than from the project', async () => {
    await harnessed.catalog.add(
      localAsset({ type: 'video', path: undefined, sourcePath: '/Volumes/Rushes/take.mp4' }),
    )
    await harnessed.backend.push('asset_1')

    expect(harnessed.multiparts[0]).toMatchObject({ file: '/Volumes/Rushes/take.mp4' })
  })

  it('refuses a format the API does not take, before spending the transfer on it', async () => {
    await harnessed.catalog.add(localAsset({ path: 'assets/img/asset_1.psd' }))

    await expect(harnessed.backend.push('asset_1')).rejects.toThrow(
      localizedError('uploadFormatUnsupported', { name: 'Boulder.psd' }).message,
    )
    expect(harnessed.smalls).toHaveLength(0)
    expect(harnessed.multiparts).toHaveLength(0)
  })

  it('refuses an asset that holds no file of its own', async () => {
    await harnessed.catalog.add(localAsset({ path: undefined, location: 'cloud' }))
    await expect(harnessed.backend.push('asset_1')).rejects.toThrow(
      localizedError('assetFileMissing', { name: 'asset_1' }).message,
    )
  })

  it('refuses an asset the catalogue has never heard of', async () => {
    await expect(harnessed.backend.push('asset_missing')).rejects.toThrow(
      localizedError('assetNotCatalogued', { name: 'asset_missing' }).message,
    )
  })
})

describe('what the library leaves unsaid', () => {
  it('brings down an asset that reports neither owner, date nor generation', async () => {
    const { backend, imported } = harness()
    await backend.pull(cloudAsset({ ownerId: '', updatedAt: '', generation: undefined }))

    const request = imported[0]
    expect(request?.remoteAssetId).toBe('remote_1')
    expect(request?.remoteOwnerId).toBeUndefined()
    expect(request?.remoteUpdatedAt).toBeUndefined()
    expect(request?.generation).toBeUndefined()
  })

  it('records a push whose upload reported nothing but an id', async () => {
    const bare = harness({
      multipart: () => Promise.resolve({ assetId: 'remote_bare' }),
      sizeOf: () => Promise.resolve(SMALL_LIMIT + 1),
    })
    await bare.catalog.add({
      id: 'asset_1',
      name: 'Boulder',
      type: 'image',
      location: 'local',
      path: 'assets/img/asset_1.png',
      tags: [],
      createdAt: '2026-08-06T10:00:00.000Z',
    })

    const pushed = await bare.backend.push('asset_1')
    expect(pushed).toMatchObject({ remoteAssetId: 'remote_bare', syncStatus: 'synced' })
    expect(pushed.remoteOwnerId).toBeUndefined()
    expect(pushed.remoteUpdatedAt).toBeUndefined()
  })

  it('keeps a name that could otherwise walk out of its folder', async () => {
    // The name becomes a file name on the way up; a slash in it would name another path.
    const named = harness()
    await named.catalog.add({
      id: 'asset_1',
      name: 'set/dressing/boulder',
      type: 'image',
      location: 'local',
      path: 'assets/img/asset_1.png',
      tags: [],
      createdAt: '2026-08-06T10:00:00.000Z',
    })
    await named.backend.push('asset_1')

    expect(named.smalls[0]?.name).toBe('set-dressing-boulder.png')
  })
})
