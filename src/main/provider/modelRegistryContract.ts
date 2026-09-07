import type { EngineFailure } from '@shared/domain/failure'
import {
  CATALOGUE_FAMILIES,
  FEATURED_TAG,
  LOCAL_RUNTIME,
  PERIOD_DAYS,
  PROVIDER_MAINTAINER,
  servesStudioCapability,
  studioCapability,
  SYSTEM_TAG_PREFIX,
  tagOfFamily,
  type ModelDescriptor,
  type ModelFamily,
  type ModelPage,
  type ModelPeriod,
  type ModelQuery,
  type ModelSort,
  type ModelSummary,
} from '@shared/domain/model'
import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'
import {
  catalogueLineOf,
  capabilitiesIn,
  modelThumbnailUrl,
  type LocalModel,
} from '@shared/domain/localModel'
import type { WatchCredentials } from './credentialsWatch'
import { familyOf, type ProviderInput } from './schema'

/**
 * A model as the API returns it, reduced to what the studio reads. Narrower than the SDK
 * type on purpose: it is the whole contract with the outside world, and it is what lets the
 * registry be tested without a network.
 */
export type RemoteModel = {
  id: string
  name?: string
  capabilities?: readonly string[]
  tags?: readonly string[]
  source?: string
  shortDescription?: string
  createdAt?: string
  thumbnail?: { url?: string }
  /** Pictures the model's owner published. Measured: 628 of the 640 public models have some. */
  exampleAssetIds?: readonly string[]
  /**
   * Read against `PROVIDER_MAINTAINER`. Listing, search index and `GET /models/{id}` all carry
   * it — measured on every public model of all three, unlike `accessRestrictions` below.
   */
  complianceMetadata?: { maintainer?: string }
  /**
   * Whose catalogue the model sits in, carried by the record on all three paths — which is what
   * lets `summaryOf` answer without being told which pass fetched it.
   *
   * A plain string, for the reason `ModelSummary.source` is one.
   */
  privacy?: string
  /**
   * The plan grade below which the API refuses this model. Widened from the SDK's union on
   * purpose — see `ModelSummary.requiredPlanLevel`, which two models already contradict.
   *
   * `null` is a real answer, not a missing one: measured, `GET /models` always grades a model
   * with a number, while `POST /search/models` answers `null` for every hit — the search index
   * does not carry the field. That is why the search path is graded from `grades` below.
   */
  accessRestrictions?: number | null
  inputs?: readonly ProviderInput[]
}

type RemoteAsset = {
  id: string
  url?: string
  /** `video/mp4`, `model/gltf-binary`, `audio/mpeg`… — `url` is only showable when it is an image. */
  mimeType?: string
  /** A still the API renders for what cannot be shown directly: video, 3D and audio all have one. */
  thumbnail?: { url?: string }
}

export type CatalogPage = {
  models: readonly RemoteModel[]
  /** Continuation for the same listing, or `null` when it is exhausted. */
  token: string | null
}

export type ListRequest = {
  privacy: 'private' | 'public'
  pageSize: number
  token?: string
  sort: ModelSort
  /**
   * ONE tag, as a coarse pre-filter. Measured: the API unions the tags it is given — `Video`
   * alone answers 127 models, `Kling` alone 23, and `Video,Kling` answers 139. Passing every
   * chosen tag would therefore WIDEN the result with each filter added. The exact match is
   * made here instead, and this only narrows what has to be walked.
   *
   * Never one from `SYSTEM_TAG_PREFIX`, which the endpoint answers nothing for. `preFilter`
   * is where that is decided.
   */
  tag?: string
  /** ISO date the models must be newer than, already resolved from the requested span. */
  createdAfter?: string
}

export type SearchRequest = {
  query: string
  limit: number
  offset: number
}

export type ModelCatalog = {
  list: (request: ListRequest) => Promise<CatalogPage>
  search: (request: SearchRequest) => Promise<CatalogPage>
  retrieve: (modelId: string) => Promise<{ model: RemoteModel }>
  /** Signed URLs for asset ids, in one request. */
  assetUrls: (assetIds: readonly string[]) => Promise<readonly RemoteAsset[]>
}

export type ModelRegistry = {
  search: (query: ModelQuery) => Promise<ModelPage>
  describe: (modelId: string) => Promise<ModelDescriptor>
  /** Signed picture URL per asset id, absent for the ones the API has nothing for. */
  previews: (assetIds: readonly string[]) => Promise<Record<string, string>>
}

export type RegistryOptions = {
  catalog: () => ModelCatalog
  /** Required: everything cached here belongs to one account, and none of the keys say which. */
  watch: WatchCredentials
  /**
   * The models on THIS machine that serve a space — never the assistant or the recognition model,
   * which answer a role and belong to no panel. Read on each call: one is added while this runs.
   */
  localModels: () => readonly LocalModel[]
  /** Whether a local model's weights are on this disk. Read per call: an install lands mid-panel. */
  isInstalled: (modelId: string) => boolean
  /** Why no local model can run right now, when none can — carried on each one as `unavailable`. */
  engineFailure?: () => EngineFailure | null
  /**
   * A cloud's whole catalogue as DATA rather than through a listing, each entry carrying its own
   * `runsOn` — so nothing here is told which cloud answered. Empty while no key is held: a
   * picker offering models an account cannot run ends in a refusal nobody can read.
   */
  publishedModels?: () => readonly ModelDescriptor[]
  /**
   * The same catalogue whether or not a key is held, for `describe` alone.
   *
   * 🛑 A model id is STORED — a preference, a panel that was open. Read through the list above,
   * an id whose key has since been removed fell through to the API, which has never heard of it:
   * the same `404 Model … not found` the local branch below exists to prevent.
   */
  publishedModelOf?: (modelId: string) => ModelDescriptor | null
  /** Names the knobs of a local model's form. The main process holds the language as a service. */
  translate: (key: string) => string
  /** Told of a cloud refusal the page carries instead of throwing, so the journal still hears it. */
  note?: (failure: unknown) => void
  ttlMs?: number
  now?: () => number
}

export const DEFAULT_TTL_MS = 10 * 60 * 1000
export const MODEL_REGISTRY_DEFAULT_LIMIT = 24
export const PAGE_SIZE = 100
/** Stale entries used to sit in these maps for the life of the process. */
export const MAX_CACHED = 64

/**
 * Filters the API cannot apply — family, capability, community-only — are applied here, so a
 * selective one can empty several pages in a row. The walk stops anyway and hands back its
 * cursor: an infinite list asks again on its own, and a request that walks the whole
 * catalogue before answering is exactly the freeze this pagination exists to avoid.
 */
export const MAX_PAGES_PER_REQUEST = 5

/** One round trip per screenful of cards; the endpoint takes the ids in a single body. */
export const PREVIEW_BATCH = 50

/**
 * Every plan grade the catalogue has answered so far, by model id.
 *
 * MEASURED: `GET /models` grades every model with a number, while `POST /search/models` answers
 * `null` on every hit — the search index does not carry the field. Without this, a model found
 * by name came back ungraded and was offered as runnable, while the very same model in the
 * listing was greyed out. Grades do not change under a model, so remembering what the listings
 * said is enough to grade most search hits too.
 *
 * NOT cleared by the credential purge, unlike every other cache here: a grade is a property of
 * the model, not of who is asking.
 */
export type Grades = Map<string, number>

/**
 * Whether the model belongs to Scenario's public catalogue rather than to this account.
 *
 * BOTH conditions, and the privacy one is not redundant: measured 2026-08-15, the one model this
 * account has trained answers `maintainer: Scenario` like the catalogue does, so that field
 * alone filed the user's own models as official — and "Community" then hid the very models only
 * they can see.
 *
 * It buys the PRIVATE case and only that: a model the user trained and then PUBLISHED would
 * read as official. `ownerId` would tell it apart — measured, all 640 public models share one,
 * where this account's own model carries its project's — but keying authorship to an opaque id
 * held in no contract is worse than the case it fixes: the day Scenario publishes under a
 * second owner, the whole catalogue turns community and nothing reddens. Left as is knowingly.
 */
const isOfficial = (model: RemoteModel): boolean =>
  model.privacy === 'public' && model.complianceMetadata?.maintainer === PROVIDER_MAINTAINER

function decorateRemoteSummary(summary: ModelSummary, model: RemoteModel, grades: Grades): void {
  const [preview] = model.exampleAssetIds ?? []
  if (preview) summary.previewAssetId = preview
  if (model.shortDescription) summary.description = model.shortDescription
  if (model.thumbnail?.url) summary.thumbnail = model.thumbnail.url
  if (model.createdAt) summary.createdAt = model.createdAt
  const grade =
    typeof model.accessRestrictions === 'number' ? model.accessRestrictions : grades.get(model.id)
  if (grade !== undefined) {
    summary.requiredPlanLevel = grade
    grades.set(model.id, grade)
  }
}

export function summaryOf(model: RemoteModel, grades: Grades): ModelSummary {
  const summary: ModelSummary = {
    id: model.id,
    // An unnamed model is still usable; showing its id beats showing nothing.
    name: model.name ?? model.id,
    family: familyOf(model.capabilities, model.tags ?? []),
    runsOn: SCENARIO_CLOUD,
    source: model.source ?? 'other',
    origin: isOfficial(model) ? 'official' : 'community',
    featured: (model.tags ?? []).includes(FEATURED_TAG),
    capabilities: model.capabilities ?? [],
    tags: model.tags ?? [],
  }
  decorateRemoteSummary(summary, model, grades)
  return summary
}

/**
 * A model on THIS machine, as the panel reads it.
 *
 * `null` if it serves no space — no family, or not `asFamily` when one is given.
 */
export function localSummaryOf(
  model: LocalModel,
  installed: boolean,
  asFamily?: ModelFamily,
  unavailable: EngineFailure | null = null,
): ModelSummary | null {
  const family = asFamily ?? model.family
  if (family === undefined) return null

  const capabilities = capabilitiesIn(model, family)
  if (capabilities === null) return null

  const line = catalogueLineOf(model)
  return {
    id: model.id,
    name: model.name,
    family,
    runsOn: LOCAL_RUNTIME,
    source: model.source,
    // `origin` says who PUBLISHES, and nothing running on this machine is published by the cloud
    // the studio was built on — which is what `official` means here.
    origin: 'community',
    installed,
    ...(model.files.length === 0 ? { downloadable: false } : {}),
    ...(unavailable === null ? {} : { unavailable }),
    diskBytes: model.diskBytes,
    featured: model.featured ?? false,
    capabilities,
    tags: [],
    // Always one: the manifest names its own, and a modality's generic picture stands in for a
    // model the person supplied. A card with nothing to draw is what this exists to prevent.
    thumbnail: modelThumbnailUrl(model),
    ...(line === undefined ? {} : { description: line }),
    ...(model.releasedAt === undefined ? {} : { createdAt: model.releasedAt }),
  }
}

/**
 * Where the next page resumes. Opaque to the renderer, which only ever hands it back: the two
 * listings paginate differently — a token for the catalogue, an offset for the search index —
 * and the panel has no business knowing which one answered it.
 */
export type Cursor =
  | {
      mode: 'list'
      privacy: 'private' | 'public'
      token?: string
      /**
       * How much of that page was already handed out. A server page holds several screenfuls,
       * and without this the remainder of a half-read page would be skipped outright.
       */
      skip?: number
    }
  | { mode: 'search'; offset: number }

export function serialize(cursor: Cursor): string {
  if (cursor.mode === 'search') return `s:${cursor.offset}`
  // Token last: it comes from the API and may hold colons of its own.
  return `l:${cursor.privacy}:${cursor.skip ?? 0}:${cursor.token ?? ''}`
}

export function deserialize(value: string | undefined): Cursor | null {
  if (!value) return null

  if (value.startsWith('s:')) {
    const offset = Number(value.slice(2))
    return Number.isInteger(offset) && offset >= 0 ? { mode: 'search', offset } : null
  }

  const [, privacy, skipped, ...rest] = value.split(':')
  if (privacy !== 'private' && privacy !== 'public') return null

  const skip = Number(skipped)
  if (!Number.isInteger(skip) || skip < 0) return null

  const token = rest.join(':')
  return { mode: 'list', privacy, ...(skip ? { skip } : {}), ...(token ? { token } : {}) }
}

/**
 * Where a listing starts. `official` skips the private pass outright: `isOfficial` refuses a
 * private model whatever else it says, so that page could only be discarded.
 */
export function firstCursor(query: ModelQuery): Cursor {
  if (query.search?.trim()) return { mode: 'search', offset: 0 }
  return { mode: 'list', privacy: query.origin === 'official' ? 'public' : 'private' }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Start of the requested span, resolved here so the renderer never sends a moving date. */
export function cutoff(period: ModelPeriod, at: number): string {
  return new Date(at - PERIOD_DAYS[period] * DAY_MS).toISOString()
}

/**
 * The picture that stands for an asset, or nothing showable at all.
 *
 * Measured across families: an image example carries its picture in `url` and nothing in
 * `thumbnail`; a video, a 3D mesh and an audio clip carry an unusable `url` and a still in
 * `thumbnail`. Reading `url` alone left every non-image workspace without a single card.
 */
export function showable(asset: RemoteAsset): string | null {
  if (asset.thumbnail?.url) return asset.thumbnail.url
  return asset.mimeType?.startsWith('image/') && asset.url ? asset.url : null
}

/**
 * Whether the model serves this capability — the API's own enum, or one the studio names.
 *
 * A studio capability is never in `summary.capabilities`: no model publishes `rig`. It is
 * decided by the rule `STUDIO_CAPABILITIES` carries, against the family the summary was filed
 * under, so a filter on one answers the same models the employment offers.
 */
function serves(summary: ModelSummary, capability: string): boolean {
  // What the model PUBLISHES first, whatever else is known about the capability: a local
  // manifest names its employments outright — the four panorama models declare `txt2skybox` —
  // where the cloud catalogue answers the enum value underneath it.
  if (summary.capabilities.includes(capability)) return true

  const studio = studioCapability(capability)
  return (
    studio !== undefined &&
    summary.family === studio.family &&
    servesStudioCapability(studio, summary)
  )
}

/** Whether a remote catalogue publishes this family at all. No family asked for means every one. */
export function servedByCatalogue(family: ModelFamily | undefined): boolean {
  return family === undefined || CATALOGUE_FAMILIES.includes(family)
}

/**
 * The whole narrowing, applied to every model whichever pass it came from.
 *
 * Nothing here is redundant with the request: the private listing accepts no `tags`, no sort
 * and no `createdAfter` at all — those are public-only parameters — so a model the user
 * trained would sail past every filter if this did not catch it. And the tag the request does
 * carry is a coarse union, never the exact set asked for.
 */
export function matches(summary: ModelSummary, query: ModelQuery, since: string | null): boolean {
  if (query.family && summary.family !== query.family) return false
  if (query.runsOn && summary.runsOn !== query.runsOn) return false
  if (query.origin && summary.origin !== query.origin) return false

  if (query.capabilities?.length && !query.capabilities.some(one => serves(summary, one))) {
    return false
  }

  // Every chosen tag, unlike the API's union: a publisher AND a subject means both.
  if (query.tags?.length) {
    const held = new Set(summary.tags)
    if (!query.tags.every(tag => held.has(tag))) return false
  }

  if (since && (summary.createdAt === undefined || summary.createdAt < since)) return false

  return true
}

/**
 * Whether a model the studio holds ITSELF answers a typed search.
 *
 * 🛑 Never applied to a catalogue hit: the endpoint answers by semantic likeness, so narrowing
 * its results by the letters typed would throw away most of what it found. The models held here
 * have no such index — unfiltered, one cloud's fifty-four entries filled the whole page and the
 * model actually searched for never appeared.
 */
export function named(summary: ModelSummary, search: string | undefined): boolean {
  const wanted = search?.trim().toLocaleLowerCase()
  if (!wanted) return true

  return `${summary.name} ${summary.id}`.toLocaleLowerCase().includes(wanted)
}

/**
 * The one tag the listing is narrowed by server-side, ahead of `matches`.
 *
 * A chosen tag comes first — it is what the user asked for. Failing that, the three families
 * whose tag the API indexes are worth asking for by it: four to thirteen models out of six
 * hundred, and walking the public catalogue page by page to keep them costs eight round trips
 * to fill one screen. Every other family is dense enough that the local filter settles it.
 *
 * Nothing from `SYSTEM_TAG_PREFIX` leaves, whichever of the two it came from: the endpoint
 * answers zero models for those, so the pre-filter would not shorten the walk but empty it.
 *
 * The skyboxes are narrowed by nothing at all — `tagOfFamily` already answers nothing for a
 * family holding several tags, and this refuses `sc:skybox` besides, should one ever be asked
 * for by hand. `matches` classifies them off the records instead. Measured 2026-08-15, the walk
 * does reach them: the four sit at offsets 178, 231, 248 and 302 of the score-ordered public
 * listing, so one request's five pages of a hundred bring them all back.
 */
export function preFilter(query: ModelQuery): string | undefined {
  const wanted = query.tags?.[0] ?? (query.family ? tagOfFamily(query.family) : undefined)
  return wanted?.startsWith(SYSTEM_TAG_PREFIX) ? undefined : wanted
}

export type Cached<T> = { at: number; value: T }

/**
 * Serves the catalogue one page at a time and caches what it has already walked. Listing the
 * six hundred public models up front cost a freeze on the first paint, and a model's schema
 * changes at Scenario's pace, not at ours: refetching on each keystroke would spend the rate
 * budget on data that is stable for hours.
 */
