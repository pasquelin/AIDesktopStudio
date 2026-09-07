import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { CHANNELS } from '@shared/ipc'
import type { Asset } from '@shared/domain/asset'
import type { CloudAsset } from '@shared/domain/cloudAsset'
import { invoke as invokeChannel, resetHandlers } from '@main/ipc/testHarness'
import { createActivityLog, type ActivityLog } from '@main/project/activityLog'
import { memoryCatalog } from '@main/project/catalog-fixtures'
import type { AsyncCatalog } from '@main/project/catalogClient'
import type { RemoteAssetCatalog } from '@main/provider/assetCatalog'
import { registerAssetHandlers, type AssetHandlerDeps } from './handlers'
import type { CloudBackend } from './cloudBackend'
import { assetHandlerCalls } from './handlersTestFixtures'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  // The harness answers `unknown`, and every caller knows the shape its own channel returns.
  // A guard here would be a second copy of the contract `shared/ipc.ts` already states.
  const answer: unknown = await invokeChannel(channel, ...args)
  return answer as T
}

function localAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset_1',
    name: 'Boulder',
    type: 'image',
    location: 'local',
    path: 'assets/img/asset_1.png',
    tags: [],
    createdAt: '2026-08-06T10:00:00.000Z',
    ...overrides,
  }
}

function cloudAsset(id: string): CloudAsset {
  return {
    id,
    name: 'Boulder',
    type: 'image',
    remoteType: 'txt2img',
    ownerId: 'proj_a',
    createdAt: '2026-08-06T10:00:00.000Z',
    updatedAt: '2026-08-06T10:00:00.000Z',
    privacy: 'private',
    tags: [],
    collectionIds: [],
  }
}

type Harness = {
  catalog: AsyncCatalog
  cloud: CloudBackend
  journal: ActivityLog
  /** The rows the describe channel handed over — what proves the ids were resolved first. */
  described: Asset[]
  listed: unknown[]
  searched: unknown[]
  tagged: unknown[]
  deleted: string[][]
  pulled: string[]
  pushed: string[]
  removedFiles: string[]
  /** The moves a rename ordered, in order — a name is a file name now, and this is that half. */
  renamedFiles: { id: string; name: string }[]
}

function setup(
  overrides: {
    remote?: Partial<RemoteAssetCatalog>
    open?: AssetHandlerDeps['remote']
    push?: CloudBackend['push']
    renameFile?: AssetHandlerDeps['renameFile']
  } = {},
): Harness {
  resetHandlers()
  const catalog = memoryCatalog()
  onTestFinished(catalog.close)
  const calls = assetHandlerCalls()

  const remote: RemoteAssetCatalog = {
    list: request => {
      calls.listed.push(request)
      return Promise.resolve({ assets: [cloudAsset('remote_1')], token: null })
    },
    search: request => {
      calls.searched.push(request)
      return Promise.resolve({ assets: [cloudAsset('remote_2')], token: null })
    },
    getBulk: ids => Promise.resolve(ids.map(cloudAsset)),
    updateTags: (assetId, add, remove) => {
      calls.tagged.push({ assetId, add, remove })
      return Promise.resolve()
    },
    deleteMany: ids => {
      calls.deleted.push([...ids])
      return Promise.resolve()
    },
    downloadUrl: () => Promise.resolve('https://cdn/fresh'),
    ...overrides.remote,
  }

  const cloud: CloudBackend = {
    pull: async asset => {
      calls.pulled.push(asset.id)
      return await catalog.add(localAsset({ id: `local_${asset.id}`, remoteAssetId: asset.id }))
    },
    push:
      overrides.push ??
      (async assetId => {
        calls.pushed.push(assetId)
        const asset = await catalog.find(assetId)
        if (!asset) throw new Error('missing')
        return asset
      }),
  }

  // The real one, on the same in-memory catalogue: what reaches the journal is part of what a
  // handler does, and a spy would only prove the call was made.
  const journal = createActivityLog({
    catalog: () => catalog,
    broadcast: () => {},
    now: () => '2026-08-08T10:00:00.000Z',
  })

  const described: Asset[] = []

  registerAssetHandlers({
    catalog: () => catalog,
    remote: overrides.open ?? (() => remote),
    cloud: () => cloud,
    // The real one is exercised in `autoCaption.test.ts`; here it must only stay out of the way.
    captionArrivals: async () => {},
    describeAssets: async assets => {
      described.push(...assets)
      return assets.length
    },
    removeFile: async asset => {
      calls.removedFiles.push(asset.id)
    },
    // The disk itself is exercised in `assetFile.test.ts`; what this harness has to show is
    // that the handler moves the file BEFORE the row, and files the path it comes back with.
    renameFile:
      overrides.renameFile ??
      (async (asset, name) => {
        calls.renamedFiles.push({ id: asset.id, name })
        return asset.path ? `assets/img/${name}.png` : undefined
      }),
    activeOwnerId: () => 'proj_a',
    journal: () => journal,
  })

  return {
    catalog,
    cloud,
    journal,
    described,
    ...calls,
  }
}

describe('what a plan reads off an asset', () => {
  it('carries every stamp the catalogue holds', async () => {
    const full = setup()
    await full.catalog.add(
      localAsset({
        remoteAssetId: 'remote_1',
        remoteOwnerId: 'proj_a',
        remoteUpdatedAt: '2026-08-06T09:00:00.000Z',
        remoteSyncedAt: '2026-08-06T09:00:00.000Z',
        localChangedAt: '2026-08-06T12:00:00.000Z',
      }),
    )

    const plan = await invoke<{ summary: Record<string, number> }>(
      CHANNELS.cloudPlan,
      ['asset_1'],
      'two-way',
    )

    // Edited here since the two agreed, untouched there: it goes up.
    expect(plan.summary).toMatchObject({ push: 1, pull: 0, conflict: 0 })
  })

  it('reads an asset that holds no file as one to fetch', async () => {
    const cloudOnly = setup()
    await cloudOnly.catalog.add(
      localAsset({ path: undefined, location: 'cloud', remoteAssetId: 'remote_1' }),
    )

    const plan = await invoke<{ summary: Record<string, number> }>(
      CHANNELS.cloudPlan,
      ['asset_1'],
      'pull',
    )

    expect(plan.summary).toMatchObject({ pull: 1 })
  })

  it('skips an asset the catalogue no longer holds rather than failing the plan', async () => {
    setup()
    const plan = await invoke<{ actions: unknown[] }>(CHANNELS.cloudPlan, ['asset_gone'], 'push')

    expect(plan.actions).toEqual([])
  })
})

describe('walking through the pages of the library', () => {
  it('hands the listing back the token it gave out', async () => {
    const paged = setup()
    await invoke(CHANNELS.cloudBrowse, { cursor: 't:page-2' })

    expect(paged.listed[0]).toMatchObject({ token: 'page-2' })
  })

  it('reads the search cursor as the offset it is', async () => {
    const paged = setup()
    await invoke(CHANNELS.cloudBrowse, { text: 'moss', cursor: 'o:40' })

    expect(paged.searched[0]).toMatchObject({ offset: 40 })
  })

  // Clearing the search box while holding a page used to hand "40" to the listing as a token.
  it('ignores a cursor the other side produced', async () => {
    const paged = setup()
    await invoke(CHANNELS.cloudBrowse, { cursor: 'o:40' })
    await invoke(CHANNELS.cloudBrowse, { text: 'moss', cursor: 't:page-2' })

    expect(paged.listed[0]).not.toHaveProperty('token')
    expect(paged.searched[0]).toMatchObject({ offset: 0 })
  })

  it('starts at the beginning when the cursor makes no sense', async () => {
    const paged = setup()
    await invoke(CHANNELS.cloudBrowse, { text: 'moss', cursor: 'o:not-a-number' })

    expect(paged.searched[0]).toMatchObject({ offset: 0 })
  })

  it('says which side a cursor came from, so the next page goes back to it', async () => {
    setup({
      remote: {
        list: () => Promise.resolve({ assets: [], token: 'page-3' }),
        search: () => Promise.resolve({ assets: [], token: '60' }),
      },
    })

    const listed = await invoke<{ cursor: string | null }>(CHANNELS.cloudBrowse, {})
    const searched = await invoke<{ cursor: string | null }>(CHANNELS.cloudBrowse, { text: 'a' })

    expect(listed.cursor).toBe('t:page-3')
    expect(searched.cursor).toBe('o:60')
  })

  it('narrows a listing to a collection', async () => {
    const scoped = setup()
    await invoke(CHANNELS.cloudBrowse, { collectionId: 'col_1' })

    expect(scoped.listed[0]).toMatchObject({ collectionId: 'col_1' })
  })
})

describe('removing assets that were never sent up', () => {
  it('asks the library for nothing when none of them has a twin', async () => {
    const local = setup()
    await local.catalog.add(localAsset())
    await invoke(CHANNELS.assetsRemove, ['asset_1'], true)

    expect(local.deleted).toHaveLength(0)
    expect(await local.catalog.find('asset_1')).toBeNull()
  })
})

describe('describing a selection', () => {
  let harness: Harness

  beforeEach(() => {
    resetHandlers()
    harness = setup()
  })

  it('hands the catalogue rows over, and answers how many were named', async () => {
    await harness.catalog.add(localAsset({ id: 'asset_1', remoteAssetId: 'remote_1' }))
    await harness.catalog.add(localAsset({ id: 'asset_2', remoteAssetId: 'remote_2' }))

    await expect(invoke(CHANNELS.assetsDescribe, ['asset_1', 'asset_2'])).resolves.toBe(2)
    expect(harness.described.map(asset => asset.id)).toEqual(['asset_1', 'asset_2'])
  })

  // A selection can outlive the rows it points at — a delete in another window.
  it('drops the ids the catalogue no longer knows', async () => {
    await harness.catalog.add(localAsset({ id: 'asset_1' }))

    await expect(invoke(CHANNELS.assetsDescribe, ['asset_1', 'asset_gone'])).resolves.toBe(1)
    expect(harness.described.map(asset => asset.id)).toEqual(['asset_1'])
  })
})
