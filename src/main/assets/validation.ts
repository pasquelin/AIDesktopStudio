import { z } from 'zod'
import {
  ACTIVITY_LEVELS,
  ACTIVITY_RETENTION,
  ACTIVITY_TOPICS,
  type ActivityQuery,
} from '@shared/domain/activity'
import {
  ASSET_NAME_MAX_LENGTH,
  ASSET_TYPES,
  CLOUD_ASSET_TYPES,
  type AssetChanges,
} from '@shared/domain/asset'
import { CLOUD_ORDERS, type CloudQuery, type ExploreQuery } from '@shared/domain/cloudAsset'

import { SYNC_POLICIES, type SyncPolicy } from '@shared/domain/sync'
import { GET_BULK_MAX, PAGE_SIZE_MAX } from '@main/provider/limits'

/**
 * What the renderer is allowed to ask of the library.
 *
 * Separate from `project/validation.ts`, which guards the catalogue: these bounds come from the
 * API's own limits rather than from ours, and mixing the two would hide which side each one
 * protects. They REFUSE rather than clamp — a caller asking for three hundred ids has a bug,
 * and silently serving two hundred would hide it while dropping a third of the answer.
 */

/**
 * Bounded like every other string that crosses: an id travels into a filter expression and into
 * the request line the SDK logs, and that line is not truncated the way a failure detail is.
 */
export const assetId = z.string().trim().min(1).max(200)

export function parseAssetId(value: unknown): string {
  return assetId.parse(value)
}

/** Bounded well below what SQLite would take: the ids travel in one IPC message. */
const assetIds = z.array(assetId).min(1).max(GET_BULK_MAX)

export function parseAssetIds(value: unknown): string[] {
  return assetIds.parse(value)
}

const assetChanges = z.object({
  name: z.string().trim().min(1).max(ASSET_NAME_MAX_LENGTH).optional(),
  // Replaced wholesale, so an empty list is a real answer — "this asset has no tags".
  tags: z.array(z.string().trim().min(1).max(80)).max(64).optional(),
  // One of the six the studio knows, and nothing else: `other` is what a file with no row is,
  // never what a row says of itself.
  type: z.enum(ASSET_TYPES).optional(),
  modelMaterialIds: z.array(z.string().min(1)).max(64).optional(),
})

export function parseAssetChanges(value: unknown): AssetChanges {
  return assetChanges.parse(value)
}

const cloudQuery = z.object({
  text: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(32).optional(),
  // The kinds the API sorts by, never every kind the studio knows: a request naming one it has
  // never heard of would come back filtered by nothing at all.
  types: z.array(z.enum(CLOUD_ASSET_TYPES)).max(CLOUD_ASSET_TYPES.length).optional(),
  collectionId: z.string().trim().min(1).optional(),
  // Opaque and produced by the API; bounded only so a hostile value cannot grow without end.
  cursor: z.string().max(2048).optional(),
  pageSize: z.number().int().min(1).max(PAGE_SIZE_MAX).optional(),
  order: z.enum(CLOUD_ORDERS).optional(),
})

export function parseCloudQuery(value: unknown): CloudQuery {
  return cloudQuery.parse(value)
}

/** One tab of the public feed. `type` is required: the feed is never asked for everything. */
const exploreQuery = z.object({
  type: z.enum(CLOUD_ASSET_TYPES),
  text: z.string().trim().max(500).optional(),
  cursor: z.string().max(2048).optional(),
  pageSize: z.number().int().min(1).max(PAGE_SIZE_MAX).optional(),
})

export function parseExploreQuery(value: unknown): ExploreQuery {
  return exploreQuery.parse(value)
}

const syncPolicy = z.enum(SYNC_POLICIES)

export function parseSyncPolicy(value: unknown): SyncPolicy {
  return syncPolicy.parse(value)
}

export function parseAlsoRemote(value: unknown): boolean {
  return z.boolean().parse(value)
}

/**
 * What the journal panel may ask for. The limit is bounded because the answer crosses the
 * boundary in one message, and a project keeps `ACTIVITY_RETENTION` lines at most anyway.
 */
const activityQuery = z.object({
  levels: z.array(z.enum(ACTIVITY_LEVELS)).max(ACTIVITY_LEVELS.length).optional(),
  topics: z.array(z.enum(ACTIVITY_TOPICS)).max(ACTIVITY_TOPICS.length).optional(),
  limit: z.number().int().min(1).max(ACTIVITY_RETENTION).optional(),
})

export function parseActivityQuery(value: unknown): ActivityQuery {
  return activityQuery.parse(value)
}
