import { describe, expect, it, onTestFinished } from 'vitest'
import { createCatalog, type Catalog } from './catalog'
import { openMemoryDatabase } from './sqliteMemory'
import { dispatchCatalogRequest } from './catalogDispatch'
import { emptyAssetCounts, type Asset } from '@shared/domain/asset'
import type {
  ActivityDraft,
  ActivityLevel,
  ActivityMessageKey,
  ActivityTopic,
} from '@shared/domain/activity'

function catalogOf(): Catalog {
  const catalog = createCatalog(openMemoryDatabase())
  onTestFinished(catalog.close)
  return catalog
}

const NO_ASSETS = emptyAssetCounts()

const asset: Asset = {
  id: 'asset-1',
  name: 'sunset concept',
  type: 'image',
  location: 'local',
  tags: ['sky'],
  createdAt: '2026-08-07T10:00:00.000Z',
}

describe('dispatchCatalogRequest', () => {
  it('adds an asset and answers with it', () => {
    const response = dispatchCatalogRequest(catalogOf(), { id: 1, op: 'add', asset })

    expect(response).toEqual({ id: 1, ok: true, value: asset })
  })

  it('finds an asset that was added', () => {
    const catalog = catalogOf()
    dispatchCatalogRequest(catalog, { id: 1, op: 'add', asset })

    const response = dispatchCatalogRequest(catalog, { id: 2, op: 'find', assetId: 'asset-1' })

    expect(response).toEqual({ id: 2, ok: true, value: asset })
  })

  it('answers null rather than failing for an asset that is not there', () => {
    const response = dispatchCatalogRequest(catalogOf(), { id: 3, op: 'find', assetId: 'absent' })

    expect(response).toEqual({ id: 3, ok: true, value: null })
  })

  // What ties a generated channel to the image it was converted from: the API answers with a
  // `parentId` of its own, and only the catalogue knows which local row that became.
  it('finds an asset by the identifier the API gave it', () => {
    const catalog = catalogOf()
    dispatchCatalogRequest(catalog, {
      id: 1,
      op: 'add',
      asset: { ...asset, remoteAssetId: 'remote-9' },
    })

    const found = dispatchCatalogRequest(catalog, {
      id: 2,
      op: 'findByRemoteId',
      remoteAssetId: 'remote-9',
    })
    const absent = dispatchCatalogRequest(catalog, {
      id: 3,
      op: 'findByRemoteId',
      remoteAssetId: 'remote-none',
    })

    expect(found).toEqual({ id: 2, ok: true, value: { ...asset, remoteAssetId: 'remote-9' } })
    expect(absent).toEqual({ id: 3, ok: true, value: null })
  })

  it('searches and answers the matching page', () => {
    const catalog = catalogOf()
    dispatchCatalogRequest(catalog, { id: 1, op: 'add', asset })

    const response = dispatchCatalogRequest(catalog, { id: 4, op: 'search', query: { limit: 10 } })

    expect(response).toEqual({ id: 4, ok: true, value: [asset] })
  })

  it('counts each kind without carrying a single row back', () => {
    const catalog = catalogOf()
    dispatchCatalogRequest(catalog, { id: 1, op: 'add', asset })
    dispatchCatalogRequest(catalog, {
      id: 2,
      op: 'add',
      asset: { ...asset, id: 'b', type: 'mesh' },
    })

    const response = dispatchCatalogRequest(catalog, { id: 3, op: 'countByType' })

    expect(response).toEqual({
      id: 3,
      ok: true,
      value: { ...NO_ASSETS, image: 1, mesh: 1 },
    })
  })

  // The four operations below reached the worker without a single test walking through the
  // dispatch: a `case` nobody exercises is a `case` a rename can silently drop.
  it('finds an asset by the bytes it holds, which is how a duplicate import is caught', () => {
    const catalog = catalogOf()
    dispatchCatalogRequest(catalog, { id: 1, op: 'add', asset: { ...asset, hash: 'abc123' } })

    const found = dispatchCatalogRequest(catalog, { id: 2, op: 'findByHash', hash: 'abc123' })
    const absent = dispatchCatalogRequest(catalog, { id: 3, op: 'findByHash', hash: 'nothing' })

    expect(found).toEqual({ id: 2, ok: true, value: { ...asset, hash: 'abc123' } })
    expect(absent).toEqual({ id: 3, ok: true, value: null })
  })

  it('removes a row, and answers without carrying anything back', () => {
    const catalog = catalogOf()
    dispatchCatalogRequest(catalog, { id: 1, op: 'add', asset })

    const response = dispatchCatalogRequest(catalog, { id: 2, op: 'remove', assetId: 'asset-1' })

    expect(response).toEqual({ id: 2, ok: true, value: undefined })
    expect(dispatchCatalogRequest(catalog, { id: 3, op: 'find', assetId: 'asset-1' })).toEqual({
      id: 3,
      ok: true,
      value: null,
    })
  })

  it('appends journal lines and reads them back, newest first', () => {
    const catalog = catalogOf()
    const draft = (at: string, messageKey: ActivityMessageKey): ActivityDraft => ({
      at,
      level: 'info' as ActivityLevel,
      topic: 'project' as ActivityTopic,
      messageKey,
    })

    const appended = dispatchCatalogRequest(catalog, {
      id: 1,
      op: 'appendActivity',
      entries: [
        draft('2026-08-10T10:00:00.000Z', 'activity.imported'),
        draft('2026-08-10T11:00:00.000Z', 'activity.pushed'),
      ],
    })
    expect(appended).toMatchObject({ id: 1, ok: true })

    // Newest first, which is the order the journal panel opens on.
    const read = dispatchCatalogRequest(catalog, { id: 2, op: 'readActivity', query: {} })
    expect(read).toMatchObject({
      id: 2,
      ok: true,
      value: [{ messageKey: 'activity.pushed' }, { messageKey: 'activity.imported' }],
    })
  })

  it('answers an empty batch without touching the disk', () => {
    const response = dispatchCatalogRequest(catalogOf(), {
      id: 1,
      op: 'appendActivity',
      entries: [],
    })

    expect(response).toEqual({ id: 1, ok: true, value: [] })
  })

  // The worker must answer every request: a thrown query that killed the message loop would
  // leave the main process waiting on a promise nobody ever settles.
  it('reports a failure as a response rather than throwing', () => {
    const failing: Catalog = {
      add: () => {
        throw new Error('disk is full')
      },
      find: () => null,
      setAnimationPoster: () => false,
      findByHash: () => null,
      findByRemoteId: () => null,
      assetsUnder: () => [],
      search: () => [],
      countByType: () => NO_ASSETS,
      remove: () => {},
      repath: () => {},
      filed: () => [],
      markMissing: () => {},
      backup: () => [],
      forgetUnder: () => 0,
      appendActivity: () => [],
      readActivity: () => [],
      close: () => {},
    }

    const response = dispatchCatalogRequest(failing, { id: 5, op: 'add', asset })

    expect(response).toEqual({ id: 5, ok: false, error: 'disk is full' })
  })

  it('keeps the request id on a failure, so the caller knows which promise to reject', () => {
    const failing: Catalog = {
      add: () => asset,
      find: () => null,
      setAnimationPoster: () => false,
      findByHash: () => null,
      findByRemoteId: () => null,
      assetsUnder: () => [],
      search: () => {
        throw new Error('malformed query')
      },
      countByType: () => NO_ASSETS,
      remove: () => {},
      repath: () => {},
      filed: () => [],
      markMissing: () => {},
      backup: () => [],
      forgetUnder: () => 0,
      appendActivity: () => [],
      readActivity: () => [],
      close: () => {},
    }

    const response = dispatchCatalogRequest(failing, { id: 77, op: 'search', query: {} })

    expect(response).toMatchObject({ id: 77, ok: false })
  })
})
