import { defined, isRecord } from '@shared/guards'
import {
  ACTIVITY_MESSAGES,
  ACTIVITY_SCOPE_PREFIX,
  isActivityLevel,
  isActivityTopic,
  type ActivityEntry,
  type ActivityMessageKey,
  type ActivityParams,
} from '@shared/domain/activity'
import {
  isAssetType,
  isSyncStatus,
  mediaProbeOf,
  probeNumber,
  type Asset,
  type AssetGeneration,
  type AssetType,
  type MediaProbe,
} from '@shared/domain/asset'
import { isPbrChannel } from '@shared/domain/material'
import { MESH_IMPORT_LOSSES } from '@shared/domain/meshImport'
import { LOG_SCOPES } from '@shared/ipc'
import type { SqlRow } from './sqlite'
import { optionalNumber, optionalText, text } from './sqlRow'
import { z } from 'zod'

const vector2 = z.object({ x: z.number(), y: z.number() })
const textureUse = z.object({
  materialIndex: z.number().int().nonnegative(),
  materialName: z.string(),
  slot: z.string(),
  channel: z
    .enum(['baseColor', 'normal', 'roughness', 'metalness', 'ao', 'height', 'emissive', 'edge'])
    .optional(),
  sampling: z.object({
    channel: z.number().int().nonnegative(),
    wrapS: z.number(),
    wrapT: z.number(),
    minFilter: z.number(),
    magFilter: z.number(),
  }),
  settings: z.object({
    color: z.string(),
    roughness: z.number(),
    metalness: z.number(),
    normalScale: z.number(),
    aoIntensity: z.number(),
    emissive: z.string(),
    emissiveIntensity: z.number(),
    tiling: vector2,
    offset: vector2,
    rotation: z.number(),
  }),
})

/** The column is a closed union in the domain but a free string in SQLite. */
function assetType(row: SqlRow): AssetType {
  const value = text(row, 'type')
  return isAssetType(value) ? value : 'image'
}

/** A loss this build no longer names is dropped rather than making the row unreadable. */
function importLossesOf(row: SqlRow) {
  return parsedJson(optionalText(row, 'import_losses'), z.array(z.enum(MESH_IMPORT_LOSSES)))
}

export function assetOf(row: SqlRow, tags: string[]): Asset {
  const map = optionalText(row, 'map')
  const packedSlot = optionalText(row, 'packed_slot')
  const syncState = optionalText(row, 'sync_state')

  return {
    id: text(row, 'id'),
    name: text(row, 'name'),
    type: assetType(row),
    location: text(row, 'location') === 'cloud' ? 'cloud' : 'local',
    tags,
    createdAt: text(row, 'created_at'),
    ...defined({
      path: optionalText(row, 'path'),
      remoteAssetId: optionalText(row, 'remote_asset_id'),
      remoteOwnerId: optionalText(row, 'remote_owner_id'),
      remoteUpdatedAt: optionalText(row, 'remote_updated_at'),
      remoteSyncedAt: optionalText(row, 'remote_synced_at'),
      localChangedAt: optionalText(row, 'local_changed_at'),
      syncStatus: isSyncStatus(syncState) ? syncState : undefined,
      syncError: optionalText(row, 'sync_error'),
      jobId: optionalText(row, 'job_id'),
      derivedFrom: optionalText(row, 'derived_from'),
      groupId: optionalText(row, 'group_id'),
      outputIndex: optionalNumber(row, 'output_index'),
      generation: parseGeneration(row),
      width: optionalNumber(row, 'width'),
      height: optionalNumber(row, 'height'),
      bytes: optionalNumber(row, 'bytes'),
      sourcePath: optionalText(row, 'source_path'),
      hash: optionalText(row, 'hash'),
      probe: parseProbe(optionalText(row, 'probe')),
      proxyPath: optionalText(row, 'proxy_path'),
      peaksPath: optionalText(row, 'peaks_path'),
      posterPath: optionalText(row, 'poster_path'),
      modelTextureUses: parsedJson(optionalText(row, 'model_texture_uses'), z.array(textureUse)),
      modelMaterialIds: parsedJson(optionalText(row, 'model_material_ids'), z.array(z.string())),
      convertedFrom: optionalText(row, 'converted_from'),
      importLosses: importLossesOf(row),
    }),
    ...(isPbrChannel(map)
      ? { map, ...(optionalNumber(row, 'map_inverted') === 1 ? { mapInverted: true } : {}) }
      : {}),
    ...(packedSlot ? { packedSlot } : {}),
  }
}

function parsedJson<T>(raw: string | undefined, schema: z.ZodType<T>): T | undefined {
  if (raw === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    const result = schema.safeParse(parsed)
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}

/**
 * The generation spread across its columns and back. Without a model there is no generation:
 * an imported file has none, and a row that kept only a prompt could not be run again.
 */
function parseGeneration(row: SqlRow): AssetGeneration | undefined {
  const modelId = optionalText(row, 'model_id')
  if (modelId === undefined) return undefined

  const seed = optionalNumber(row, 'seed')
  return {
    modelId,
    modelLabel: text(row, 'model_label'),
    prompt: text(row, 'prompt'),
    params: parseParams(optionalText(row, 'gen_params')),
    ...defined({ seed }),
  }
}

function parseParams(raw: string | undefined): Record<string, unknown> {
  if (raw === undefined) return {}

  try {
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * The probe is stored as JSON: it is read whole, never filtered on, and giving each of its
 * seven fields a column would mean a migration every time a codec exposes one more.
 */
function parseProbe(raw: string | undefined): MediaProbe | undefined {
  if (raw === undefined) return undefined

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return undefined

    return (
      mediaProbeOf({
        duration: probeNumber(parsed.duration),
        codec: typeof parsed.codec === 'string' ? parsed.codec : undefined,
        width: probeNumber(parsed.width),
        height: probeNumber(parsed.height),
        fps: probeNumber(parsed.fps),
        sampleRate: probeNumber(parsed.sampleRate),
        channels: probeNumber(parsed.channels),
      }) ?? undefined
    )
  } catch {
    return undefined
  }
}

/**
 * `assets/img/` and `assets/img` are one folder to the filesystem and two strings to SQLite.
 * Every path that reaches a comparison here goes through this first.
 */
export function withoutTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '')
}

/** Whether `path` sits strictly inside `folder` — the shape `shared/domain/folder.ts` uses. */
export function isUnder(path: string, folder: string): boolean {
  return path.startsWith(`${folder}/`)
}

/**
 * The interpolations of a message key, back from the JSON they were stored as.
 *
 * Anything else is dropped rather than trusted: a value that is neither a string nor a number
 * would reach `t()` as `[object Object]`, and a line nobody can read is worse than one missing
 * a number.
 */
function activityParams(row: SqlRow): ActivityParams | undefined {
  const raw = optionalText(row, 'params')
  if (raw === undefined) return undefined

  const params: ActivityParams = {}
  for (const [key, value] of Object.entries(parseParams(raw))) {
    if (typeof value === 'string' || typeof value === 'number') params[key] = value
  }
  return params
}

/**
 * Every key a stored line may name. Scopes are resolved against `LOG_SCOPES` here rather than in
 * the domain: the list lives at the boundary, which depends on the domain and not the reverse —
 * and the main process may read it, as `diagnostics/validation.ts` already does. Checking only
 * the prefix would let a scope retired since read as itself on screen.
 */
const KNOWN_MESSAGE_KEYS = new Set<string>([
  ...ACTIVITY_MESSAGES.map(name => `activity.${name}`),
  ...LOG_SCOPES.map(scope => `${ACTIVITY_SCOPE_PREFIX}${scope}`),
])

function knownMessageKey(value: string): value is ActivityMessageKey {
  return KNOWN_MESSAGE_KEYS.has(value)
}

/**
 * One row, read back. `level` and `topic` are closed unions in the domain and free strings in
 * SQLite: a line written by a build that knew one more of either is read as an ordinary line
 * rather than taking the panel down with it.
 */
export function activityOf(row: SqlRow): ActivityEntry {
  const level = text(row, 'level')
  const topic = text(row, 'topic')
  // A line outlives the version that wrote it: a key renamed since would come back naming
  // nothing, and the window would draw it as itself.
  const messageKey = text(row, 'message_key')
  const params = activityParams(row)
  const detail = optionalText(row, 'detail')
  const assetId = optionalText(row, 'asset_id')

  return {
    id: optionalNumber(row, 'id') ?? 0,
    at: text(row, 'at'),
    level: isActivityLevel(level) ? level : 'info',
    topic: isActivityTopic(topic) ? topic : 'library',
    messageKey: knownMessageKey(messageKey) ? messageKey : 'activity.unknownMessage',
    ...defined({ params, detail, assetId }),
  }
}
