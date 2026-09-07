import { CHANNELS } from '@shared/ipc'
import { defined } from '@shared/guards'
import type { Asset } from '@shared/domain/asset'
import type { CloudAsset, CloudPage, CloudQuery, ExploreQuery } from '@shared/domain/cloudAsset'
import type { SyncOutcome } from '@shared/domain/sync'
import { handle } from '@main/ipc/handle'
import { log } from '@main/log'
import {
  apiFailureOf,
  describeFailure,
  NotAuthenticatedError,
  persistableFailure,
  quietlyReducedBy,
  reducedBy,
} from '@main/provider/client'
import type { RemoteAssetCatalog } from '@main/provider/assetCatalog'
import {
  filterExpression,
  NEWEST_FIRST,
  NSFW_EMPTY,
  publicFeedFilter,
} from '@main/provider/filterExpression'
import { remoteTypesFor } from '@main/provider/remoteTypes'
import { OFFSET_MAX, PAGE_SIZE_MAX } from '@main/provider/limits'
import type { AsyncCatalog } from '@main/project/catalogClient'
import type { AssetHandlerDeps } from './assetHandlerTypes'
import { planSync, type SyncSide } from './syncPlan'
import {
  parseAssetId,
  parseAssetIds,
  parseCloudQuery,
  parseExploreQuery,
  parseSyncPolicy,
} from './validation'

const DEFAULT_PAGE_SIZE = 50
const TOKEN_CURSOR = 't:'
const OFFSET_CURSOR = 'o:'
const RANKED_CURSOR = 'r:'
const OFFSET_MARKS: readonly string[] = [OFFSET_CURSOR, RANKED_CURSOR]
const SIMILAR_SIZE = 12
const EMPTY_ROUNDS_MAX = 3
const EMPTY_PAGE: CloudPage = { assets: [], cursor: null }
const reduced = reducedBy('assets')
const quietly = quietlyReducedBy('assets')

async function quietlyOr<T>(request: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await quietly(request)
  } catch (error) {
    if (error instanceof Error && error.cause instanceof NotAuthenticatedError) return empty
    throw error
  }
}

function boundedOffset(value: string | undefined): number {
  const offset = Number(value)
  if (!Number.isFinite(offset) || offset <= 0) return 0
  return Math.min(Math.floor(offset), OFFSET_MAX)
}

function offsetFrom(cursor: string | undefined): number {
  if (cursor === undefined) return 0
  const mark = OFFSET_MARKS.find(prefix => cursor.startsWith(prefix))
  return mark ? boundedOffset(cursor.slice(mark.length)) : 0
}

function marked(prefix: string, token: string | null): string | null {
  return token === null ? null : `${prefix}${token}`
}

function ranked(query: CloudQuery): boolean {
  if (query.cursor !== undefined) return query.cursor.startsWith(RANKED_CURSOR)
  return query.order === 'relevance' && Boolean(query.text)
}

async function searchPage(
  remote: RemoteAssetCatalog,
  query: CloudQuery,
  pageSize: number,
  byRank: boolean,
): Promise<CloudPage> {
  const found = await remote.search({
    ...(query.text ? { query: query.text } : {}),
    ...defined({ filter: filterExpression(query) }),
    ...(byRank ? {} : { sortBy: NEWEST_FIRST }),
    limit: pageSize,
    offset: offsetFrom(query.cursor),
  })
  return { ...found, cursor: marked(byRank ? RANKED_CURSOR : OFFSET_CURSOR, found.token) }
}

async function listedPage(
  remote: RemoteAssetCatalog,
  query: CloudQuery,
  pageSize: number,
): Promise<CloudPage> {
  const found = await remote.list({
    pageSize,
    ...defined({
      token: query.cursor?.startsWith(TOKEN_CURSOR)
        ? query.cursor.slice(TOKEN_CURSOR.length)
        : undefined,
      types: remoteTypesFor(query.types),
      collectionId: query.collectionId,
    }),
  })
  return { ...found, cursor: marked(TOKEN_CURSOR, found.token) }
}

async function browse(remote: RemoteAssetCatalog, query: CloudQuery): Promise<CloudPage> {
  const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, PAGE_SIZE_MAX)
  const byRank = ranked(query)
  const page =
    Boolean(query.text) || Boolean(query.tags?.length)
      ? await searchPage(remote, query, pageSize, byRank)
      : await listedPage(remote, query, pageSize)
  const wanted = query.types
  const assets = wanted?.length
    ? page.assets.filter(asset => wanted.some(type => type === asset.type))
    : page.assets
  return { assets, cursor: page.cursor }
}

async function explore(remote: RemoteAssetCatalog, query: ExploreQuery): Promise<CloudPage> {
  const limit = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, PAGE_SIZE_MAX)
  const assets: CloudAsset[] = []
  let offset = offsetFrom(query.cursor)
  let token: string | null = null
  for (let round = 0; round < EMPTY_ROUNDS_MAX; round += 1) {
    const page = await remote.search({
      ...(query.text ? { query: query.text } : {}),
      filter: publicFeedFilter(query.type),
      publicFeed: true,
      sortBy: NEWEST_FIRST,
      limit,
      offset,
    })
    assets.push(...page.assets.filter(asset => asset.type === query.type))
    token = page.token
    if (assets.length > 0 || token === null) break
    const next = boundedOffset(token)
    if (next === offset) break
    offset = next
  }
  return { assets, cursor: marked(OFFSET_CURSOR, token) }
}

async function similar(remote: RemoteAssetCatalog, assetId: string): Promise<CloudAsset[]> {
  const page = await remote.search({
    like: [assetId],
    publicFeed: true,
    filter: NSFW_EMPTY,
    limit: SIMILAR_SIZE + 1,
    offset: 0,
  })
  return page.assets.filter(asset => asset.id !== assetId).slice(0, SIMILAR_SIZE)
}

async function findMany(catalog: () => AsyncCatalog, ids: readonly string[]): Promise<Asset[]> {
  const found = await Promise.all(ids.map(id => catalog().find(id)))
  return found.filter(asset => asset !== null)
}

function sideOf(asset: Asset): SyncSide {
  return {
    assetId: asset.id,
    hasLocalFile: Boolean(asset.path ?? asset.sourcePath),
    ...defined({
      remoteAssetId: asset.remoteAssetId,
      remoteOwnerId: asset.remoteOwnerId,
      remoteUpdatedAt: asset.remoteUpdatedAt,
      remoteSyncedAt: asset.remoteSyncedAt,
      localChangedAt: asset.localChangedAt,
    }),
  }
}

async function pullAssets(deps: AssetHandlerDeps, remoteIds: unknown): Promise<SyncOutcome[]> {
  const ids = parseAssetIds(remoteIds)
  const found = await reduced(() => deps.remote().getBulk(ids))
  const outcomes: SyncOutcome[] = []
  const arrived: Asset[] = []
  for (const cloudAsset of found) {
    try {
      arrived.push(await deps.cloud().pull(cloudAsset))
      outcomes.push({ assetId: cloudAsset.id, ok: true })
    } catch (error) {
      log.error('assets', describeFailure(error))
      deps.journal().record({
        level: 'error',
        topic: 'library',
        messageKey: 'activity.pullFailed',
        params: { name: cloudAsset.name },
        detail: persistableFailure(error),
      })
      outcomes.push({ assetId: cloudAsset.id, ok: false, error: apiFailureOf(error) })
    }
  }
  recordSuccess(deps, 'activity.pulled', outcomes)
  void deps.captionArrivals(arrived)
  return outcomes
}

function recordSuccess(
  deps: AssetHandlerDeps,
  messageKey: 'activity.pulled' | 'activity.pushed',
  outcomes: readonly SyncOutcome[],
): void {
  const count = outcomes.filter(outcome => outcome.ok).length
  if (count > 0)
    deps.journal().record({ level: 'info', topic: 'library', messageKey, params: { count } })
}

async function pushOne(deps: AssetHandlerDeps, assetId: string): Promise<SyncOutcome> {
  try {
    await deps.cloud().push(assetId)
    return { assetId, ok: true }
  } catch (error) {
    log.error('assets', describeFailure(error))
    const failure = apiFailureOf(error)
    const asset = await deps.catalog().find(assetId)
    if (asset) await deps.catalog().add({ ...asset, syncStatus: 'error', syncError: failure })
    deps.journal().record({
      level: 'error',
      topic: 'library',
      messageKey: 'activity.pushFailed',
      params: { name: asset?.name ?? assetId },
      detail: persistableFailure(error),
      assetId,
    })
    return { assetId, ok: false, error: failure }
  }
}

async function pushAssets(deps: AssetHandlerDeps, assetIds: unknown): Promise<SyncOutcome[]> {
  const outcomes: SyncOutcome[] = []
  for (const assetId of parseAssetIds(assetIds)) outcomes.push(await pushOne(deps, assetId))
  recordSuccess(deps, 'activity.pushed', outcomes)
  return outcomes
}

export function registerAssetCloudHandlers(deps: AssetHandlerDeps): void {
  handle(CHANNELS.cloudSimilar, (_event, id) => {
    const parsed = parseAssetId(id)
    return quietlyOr(() => similar(deps.remote(), parsed), [])
  })
  handle(CHANNELS.cloudExplore, (_event, query) => {
    const parsed = parseExploreQuery(query)
    return quietlyOr(() => explore(deps.remote(), parsed), EMPTY_PAGE)
  })
  handle(CHANNELS.cloudBrowse, (_event, query) => {
    const parsed = parseCloudQuery(query)
    return quietlyOr(() => browse(deps.remote(), parsed), EMPTY_PAGE)
  })
  handle(CHANNELS.cloudPull, (_event, ids) => pullAssets(deps, ids))
  handle(CHANNELS.cloudPush, (_event, ids) => pushAssets(deps, ids))
  handle(CHANNELS.cloudPlan, async (_event, assetIds, policy) => {
    const found = await findMany(deps.catalog, parseAssetIds(assetIds))
    return planSync(found.map(sideOf), parseSyncPolicy(policy), deps.activeOwnerId())
  })
}
