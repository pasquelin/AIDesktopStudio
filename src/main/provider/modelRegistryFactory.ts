import {
  CAPABILITIES_BY_FAMILY,
  LOCAL_RUNTIME,
  type ModelDescriptor,
  type ModelFamily,
  type ModelPage,
  type ModelQuery,
  type ModelSummary,
} from '@shared/domain/model'
import { CLOUD_PROVIDERS, SCENARIO_CLOUD } from '@shared/domain/aiCloud'
import type { ApiFailure } from '@shared/domain/failure'
import { CODE_MAX_TOKENS, cloudOfModelId } from '@shared/domain/codeGeneration'
import { localFieldsOf, SEED_FIELD_KEY } from '@shared/domain/localFields'
import { modelThumbnailUrl } from '@shared/domain/localModel'
import { chunk } from '@shared/collections'
import { apiFailureOf } from './client'
import { translateSchema } from './schema'
import {
  MODEL_REGISTRY_DEFAULT_LIMIT,
  DEFAULT_TTL_MS,
  MAX_CACHED,
  MAX_PAGES_PER_REQUEST,
  PAGE_SIZE,
  PREVIEW_BATCH,
  cutoff,
  deserialize,
  firstCursor,
  localSummaryOf,
  matches,
  named,
  preFilter,
  serialize,
  servedByCatalogue,
  showable,
  summaryOf,
  type Cached,
  type CatalogPage,
  type Cursor,
  type Grades,
  type ModelRegistry,
  type RegistryOptions,
} from './modelRegistryContract'

type SearchState = {
  items: ModelSummary[]
  seen: Set<string>
  cursor: Cursor | null
  refused: ApiFailure | null
}

const registryNow = (options: RegistryOptions): number => (options.now ?? Date.now)()
const registryTtl = (options: RegistryOptions): number => options.ttlMs ?? DEFAULT_TTL_MS

type RegistryState = {
  pages: Map<string, Cached<ModelPage>>
  fetched: Map<string, Cached<CatalogPage>>
  descriptors: Map<string, Cached<ModelDescriptor>>
  previews: Map<string, Cached<string | null>>
  grades: Grades
  ownsModels: { at: number; value: boolean } | null
}

function registryState(): RegistryState {
  return {
    pages: new Map(),
    fetched: new Map(),
    descriptors: new Map(),
    previews: new Map(),
    grades: new Map(),
    ownsModels: null,
  }
}

export function createModelRegistry(options: RegistryOptions): ModelRegistry {
  const cache = registryState()

  const fresh = <T>(entry: Cached<T> | null | undefined): T | null =>
    entry && registryNow(options) - entry.at < registryTtl(options) ? entry.value : null

  const take = <T>(map: Map<string, Cached<T>>, key: string): T | null => {
    const entry = map.get(key)
    const value = fresh(entry)
    if (value === null || entry === undefined) return null
    map.delete(key)
    map.set(key, entry)
    return value
  }

  const prune = <T>(map: Map<string, Cached<T>>): void => {
    for (const [key, entry] of map) {
      if (registryNow(options) - entry.at >= registryTtl(options)) map.delete(key)
    }
    while (map.size > MAX_CACHED) {
      const oldest = map.keys().next().value
      if (oldest === undefined) break
      map.delete(oldest)
    }
  }

  const remember = <T>(map: Map<string, Cached<T>>, key: string, value: T): void => {
    map.delete(key)
    map.set(key, { at: registryNow(options), value })
    prune(map)
  }

  const withLiveLocals = (page: ModelPage, query: ModelQuery): ModelPage => {
    if (query.cursor !== undefined) return page

    const since = query.since ? cutoff(query.since, registryNow(options)) : null
    const held = offlineSummaries(query).filter(summary => matches(summary, query, since))
    const seen = new Set(held.map(summary => summary.id))
    const remotes = page.items.filter(item => !seen.has(item.id) && item.runsOn === SCENARIO_CLOUD)
    const limit = query.limit ?? MODEL_REGISTRY_DEFAULT_LIMIT
    return { items: [...held, ...remotes].slice(0, limit), cursor: page.cursor }
  }

  const describedLocally = (modelId: string): ModelDescriptor | null => {
    const model = options.localModels().find(one => one.id === modelId)
    if (!model) return null

    return {
      // 🛑 A model this machine holds NEVER reaches the API, whatever is missing from its
      // to `described` then sent a local id to Scenario — measured: `404 Model ssd-1b not found`,
      ...(localSummaryOf(model, options.isInstalled(model.id)) ?? {
        id: model.id,
        name: model.name,
        family: 'other',
        runsOn: LOCAL_RUNTIME,
        source: model.source,
        origin: 'community',
        installed: options.isInstalled(model.id),
        diskBytes: model.diskBytes,
        featured: false,
        capabilities: model.capabilities ?? [],
        tags: [],
        thumbnail: modelThumbnailUrl(model),
      }),
      fields: localFieldsOf(
        model.modality ?? 'text',
        model.fieldOverrides ?? {},
        options.translate,
      ),
    }
  }

  // 🛑 The seed is dropped: of the three wire formats a cloud is asked over, only some take one.
  const describedAsCloudItself = (modelId: string): ModelDescriptor | null => {
    const cloud = cloudOfModelId(modelId)
    const family = CLOUD_PROVIDERS.find(one => one.id === cloud)?.families[0]
    if (cloud === null || family === undefined) return null

    return {
      id: modelId,
      name: cloud,
      family,
      runsOn: cloud,
      source: '',
      origin: 'community',
      installed: false,
      downloadable: false,
      diskBytes: 0,
      featured: false,
      capabilities: [...CAPABILITIES_BY_FAMILY[family]],
      tags: [],
      thumbnail: '',
      fields: localFieldsOf(
        'text',
        { maxTokens: { default: CODE_MAX_TOKENS } },
        options.translate,
      ).filter(field => field.key !== SEED_FIELD_KEY),
    }
  }

  const localSummaries = (asFamily?: ModelFamily): readonly ModelSummary[] => {
    const unavailable = options.engineFailure?.() ?? null
    return options
      .localModels()
      .flatMap(
        model => localSummaryOf(model, options.isInstalled(model.id), asFamily, unavailable) ?? [],
      )
  }

  const published = (): readonly ModelDescriptor[] => options.publishedModels?.() ?? []

  const offlineSummaries = (query: ModelQuery): readonly ModelSummary[] =>
    [
      ...localSummaries(query.family),
      ...published().filter(model => query.family === undefined || model.family === query.family),
    ].filter(summary => named(summary, query.search))

  const described = async (modelId: string): Promise<ModelDescriptor> => {
    const cached = fresh(cache.descriptors.get(modelId))
    if (cached) return cached

    const { model } = await options.catalog().retrieve(modelId)
    const value: ModelDescriptor = {
      ...summaryOf(model, cache.grades),
      fields: translateSchema(model.inputs),
    }

    remember(cache.descriptors, modelId, value)
    return value
  }

  const held = (assetId: string): boolean => {
    const entry = cache.previews.get(assetId)
    return entry !== undefined && registryNow(options) - entry.at < registryTtl(options)
  }

  /**
   * A server page holds four screenfuls, so the cursor stops inside one and comes back to it.
   * Without this the same hundred models are downloaded once per screenful — measured on a
   * full walk: 33 requests for 8 distinct state.pages, and 2 500 records reparsed for nothing.
   *
   * Keyed by what actually identifies the page, filters included: two queries differing by a
   * tag are two different listings even at the same token.
   */
  const fetchPage = async (cursor: Cursor, query: ModelQuery): Promise<CatalogPage> => {
    const tag = preFilter(query)
    const key = `${tag ?? ''}|${query.sort ?? ''}|${query.since ?? ''}|${query.search?.trim() ?? ''}|${serialize({ ...cursor, ...(cursor.mode === 'list' ? { skip: 0 } : {}) })}`
    const cached = fresh(cache.fetched.get(key))
    if (cached) return cached

    const page =
      cursor.mode === 'search'
        ? await options.catalog().search({
            query: query.search?.trim() ?? '',
            limit: PAGE_SIZE,
            offset: cursor.offset,
          })
        : await options.catalog().list({
            privacy: cursor.privacy,
            pageSize: PAGE_SIZE,
            sort: query.sort ?? 'relevance',
            ...(tag ? { tag } : {}),
            ...(query.since ? { createdAfter: cutoff(query.since, registryNow(options)) } : {}),
            ...(cursor.token ? { token: cursor.token } : {}),
          })

    remember(cache.fetched, key, page)
    return page
  }

  const startOf = (query: ModelQuery): Cursor => {
    const first = firstCursor(query)
    const known = fresh(cache.ownsModels)
    const skipPrivate = first.mode === 'list' && first.privacy === 'private' && known === false
    return skipPrivate ? { mode: 'list', privacy: 'public' } : first
  }

  const advance = (cursor: Cursor, token: string | null): Cursor | null => {
    if (cursor.mode === 'search') return token ? { mode: 'search', offset: Number(token) } : null
    if (token) return { mode: 'list', privacy: cursor.privacy, token }
    return cursor.privacy === 'private' ? { mode: 'list', privacy: 'public' } : null
  }

  const stateOf = (query: ModelQuery, since: string | null): SearchState => {
    const items =
      query.cursor === undefined
        ? offlineSummaries(query).filter(summary => matches(summary, query, since))
        : []
    const elsewhere = query.runsOn !== undefined && query.runsOn !== SCENARIO_CLOUD
    return {
      items,
      seen: new Set(items.map(summary => summary.id)),
      cursor:
        elsewhere || !servedByCatalogue(query.family)
          ? null
          : (deserialize(query.cursor) ?? startOf(query)),
      refused: null,
    }
  }

  // 🛑 A remote refusal must not take the local catalogue with it — nor, with nothing local,
  // become a thrown handler: the page carries the code, and the journal is told here.
  const fetchAvailablePage = async (
    cursor: Cursor,
    query: ModelQuery,
  ): Promise<CatalogPage | ApiFailure> => {
    try {
      return await fetchPage(cursor, query)
    } catch (failure) {
      options.note?.(failure)
      return apiFailureOf(failure)
    }
  }

  const addPageItems = (
    state: SearchState,
    page: CatalogPage,
    query: ModelQuery,
    since: string | null,
    limit: number,
    skip: number,
  ): number => {
    let read = 0
    for (const model of page.models.slice(skip)) {
      read += 1
      if (state.seen.has(model.id)) continue
      const summary = summaryOf(model, cache.grades)
      if (matches(summary, query, since)) {
        state.seen.add(model.id)
        state.items.push(summary)
      }
      if (state.items.length >= limit) break
    }
    return read
  }

  const remainderCursor = (cursor: Cursor, read: number): Cursor =>
    cursor.mode === 'search'
      ? { mode: 'search', offset: cursor.offset + read }
      : {
          mode: 'list',
          privacy: cursor.privacy,
          token: cursor.token,
          skip: (cursor.skip ?? 0) + read,
        }

  const walkPage = async (
    state: SearchState,
    query: ModelQuery,
    since: string | null,
    limit: number,
  ): Promise<boolean> => {
    if (state.cursor === null) return false
    const cursor = state.cursor
    const page = await fetchAvailablePage(cursor, query)
    if (typeof page === 'string') {
      state.refused = page
      state.cursor = null
      return false
    }
    if (cursor.mode === 'list' && cursor.privacy === 'private' && !cursor.token) {
      cache.ownsModels = { at: registryNow(options), value: page.models.length > 0 }
    }
    const skip = cursor.mode === 'list' ? (cursor.skip ?? 0) : 0
    const read = addPageItems(state, page, query, since, limit, skip)
    state.cursor =
      skip + read < page.models.length ? remainderCursor(cursor, read) : advance(cursor, page.token)
    return skip + read >= page.models.length
  }

  const search = async (query: ModelQuery): Promise<ModelPage> => {
    const key = JSON.stringify(query)
    const cached = take(cache.pages, key)
    if (cached) return withLiveLocals(cached, query)
    const limit = query.limit ?? MODEL_REGISTRY_DEFAULT_LIMIT
    const since = query.since ? cutoff(query.since, registryNow(options)) : null
    const state = stateOf(query, since)
    let walked = 0
    while (state.cursor && state.items.length < limit && walked < MAX_PAGES_PER_REQUEST) {
      const completedPage = await walkPage(state, query, since, limit)
      if (!completedPage) break
      walked += 1
    }
    const value: ModelPage = {
      items: state.items,
      cursor: state.cursor ? serialize(state.cursor) : null,
      ...(state.refused === null ? {} : { refused: state.refused }),
    }
    if (state.refused === null) remember(cache.pages, key, value)
    return value
  }

  const invalidate = (): void => {
    cache.pages.clear()
    cache.fetched.clear()
    cache.descriptors.clear()
    cache.previews.clear()
    cache.ownsModels = null
  }

  options.watch(invalidate)

  const describe = async (modelId: string): Promise<ModelDescriptor> =>
    describedAsCloudItself(modelId) ??
    describedLocally(modelId) ??
    options.publishedModelOf?.(modelId) ??
    (await described(modelId))

  const resolvePreviews = async (assetIds: readonly string[]): Promise<Record<string, string>> => {
    const wanted = [...new Set(assetIds)]
    const resolved: Record<string, string> = {}

    // 🛑 Collected as it arrives, NEVER read back out of the cache: `prune` evicts past
    const take = (id: string, url: string | null): void => {
      remember(cache.previews, id, url)
      if (url) resolved[id] = url
    }

    for (const id of wanted) {
      const url = fresh(cache.previews.get(id))
      if (url) resolved[id] = url
    }

    const missing = wanted.filter(id => fresh(cache.previews.get(id)) === null && !held(id))

    await Promise.all(
      chunk(missing, PREVIEW_BATCH).map(async batch => {
        const assets = await options.catalog().assetUrls(batch)
        const found = new Map(assets.map(asset => [asset.id, showable(asset)]))

        for (const id of batch) take(id, found.get(id) ?? null)
      }),
    )

    return resolved
  }

  return {
    search,
    describe,
    previews: resolvePreviews,
  }
}
