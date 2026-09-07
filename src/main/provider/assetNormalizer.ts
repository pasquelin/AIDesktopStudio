import { defined, isRecord } from '@shared/guards'
import { probeNumber, type AssetGeneration } from '@shared/domain/asset'
import { assetTypeOfRemote } from '@shared/domain/assetKind'
import { generatedAssetName } from '@shared/domain/assetName'
import type { AssetPrivacy, CloudAsset } from '@shared/domain/cloudAsset'

/**
 * Turning an API asset into one the studio can show, from either of the two shapes it arrives in.
 *
 * There are two because `GET /assets` and `POST /search/assets` do not answer with the same
 * record: a search hit has no `kind`, no `properties`, no `status` and no `editCapabilities`,
 * and carries a `teamId` and a `score` instead. Neither is a subset of the other, so one reader
 * would have to treat half its fields as optional and lose the ability to say what is missing.
 *
 * Everything is read defensively. This is an API response, and the alternative to a guard is a
 * crash in the main process on a field that arrived one shape different.
 */

function text(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(entry => typeof entry === 'string') : []
}

function privacyOf(value: unknown): AssetPrivacy {
  return value === 'public' || value === 'unlisted' ? value : 'private'
}

/** `{ assetId, url }` on `thumbnail` and `preview` alike. Only the URL is of use here. */
function nestedUrl(value: unknown): string | undefined {
  return isRecord(value) ? text(value, 'url') : undefined
}

/**
 * The prompt and its parameters, when the asset came from a generation.
 *
 * Without a model there is no generation: an uploaded file has none, and `modelLabel` is left
 * as the id because the API never names its models — the panel resolves that separately.
 */
export function generationOfMetadata(value: unknown): AssetGeneration | undefined {
  const metadata = isRecord(value) ? value : {}
  const modelId = text(metadata, 'modelId')
  if (modelId === undefined) return undefined

  const seed = probeNumber(metadata.seed)
  return {
    modelId,
    modelLabel: modelId,
    prompt: text(metadata, 'prompt') ?? '',
    // The whole of `metadata` rather than a chosen few: what a model accepts is discovered at
    // runtime (invariant 5), so there is no list to pick from here, and the form only ever
    // reads the keys its own descriptors name.
    params: metadata,
    ...defined({ seed }),
  }
}

/**
 * What an asset is called. The API has no top-level `name` — it lives in `metadata`, and is
 * absent on everything that was generated rather than uploaded. The prompt then stands in for
 * it, which is what one actually recognises a generated picture by, and the id is the last
 * resort so that a cell is never blank.
 */
function nameOf(metadata: Record<string, unknown>, id: string): string {
  const name = text(metadata, 'name')
  if (name !== undefined) return name

  const prompt = text(metadata, 'prompt')
  if (prompt === undefined) return id

  // Through the same cut the project's own generations take, rather than a `slice` of its own:
  // one asset pulled in from here and generated there would otherwise wear two different names
  // for the same prompt — and `slice` counts UTF-16 units, so a prompt of emoji came back ending
  // on half a surrogate pair.
  return generatedAssetName({ prompt, label: id, index: 0, total: 1 })
}

/**
 * One reader for both response shapes.
 *
 * A search hit differs from a listing by absence — no `kind`, no `properties` — and absence is
 * what reading straight off the record already yields. Two functions and a shape parameter said
 * the same thing at the cost of a wrapper that rebuilt the object it had just destructured.
 */
function normalizedAsset(
  value: Record<string, unknown>,
  metadata: Record<string, unknown>,
  properties: Record<string, unknown> | undefined,
  id: string,
  type: CloudAsset['type'],
  remoteType: string,
): CloudAsset {
  const width = probeNumber(properties?.width) ?? probeNumber(metadata.width)
  const height = probeNumber(properties?.height) ?? probeNumber(metadata.height)
  const bytes = probeNumber(properties?.size)
  const durationSeconds = probeNumber(properties?.duration)
  const generation = generationOfMetadata(metadata)
  const url = text(value, 'url')
  const thumbnailUrl = nestedUrl(value.thumbnail)

  return {
    id,
    name: nameOf(metadata, id),
    type,
    remoteType,
    ownerId: text(value, 'ownerId') ?? '',
    createdAt: text(value, 'createdAt') ?? '',
    updatedAt: text(value, 'updatedAt') ?? text(value, 'createdAt') ?? '',
    privacy: privacyOf(value.privacy),
    tags: strings(value.tags),
    collectionIds: strings(value.collectionIds),
    ...defined({ url, thumbnailUrl, width, height, bytes, durationSeconds, generation }),
  }
}

function cloudAssetOf(value: unknown): CloudAsset | null {
  if (!isRecord(value)) return null
  const id = text(value, 'id')
  if (id === undefined) return null
  const metadata = isRecord(value.metadata) ? value.metadata : {}
  const remoteType = text(metadata, 'type') ?? 'unknown'
  const mimeType = text(value, 'mimeType')
  const type = assetTypeOfRemote({
    kind: text(value, 'kind') ?? text(metadata, 'kind'),
    metadataType: remoteType,
    ...defined({ mimeType }),
  })
  if (type === null) return null
  const properties = isRecord(value.properties) ? value.properties : undefined
  return normalizedAsset(value, metadata, properties, id, type, remoteType)
}

/**
 * The same asset, carrying the public thumbnail the CDN serves for it.
 *
 * A hit from `POST /search/assets` has no `thumbnail` — only the asset's own signed URL, which
 * is the full file and cannot be resized: appending a width invalidates the signature and the
 * CDN answers 302. Drawing a 220 px tile from it meant downloading the original, measured at
 * 28 MB for one upscaled texture, against 1.6 KB for the thumbnail of the same asset.
 *
 * The origin is read off the signed URL rather than written down here: it is the same CDN by
 * construction, and a hard-coded host is one deployment away from being wrong.
 *
 * Applied whatever the asset's privacy: `/thumbnails/{id}` answers 200 with a JPEG for a PRIVATE
 * asset of this account — measured 9 August 2026, against a 502 for an id that does not exist,
 * so the answer discriminates. The path carries no signature, and gating it on `privacy` would
 * have cost every private hit its thumbnail for a restriction the CDN does not apply.
 */
export function withPublicThumbnail(asset: CloudAsset): CloudAsset {
  if (asset.thumbnailUrl !== undefined || asset.url === undefined) return asset

  const origin = originOf(asset.url)
  return origin === null ? asset : { ...asset, thumbnailUrl: `${origin}/thumbnails/${asset.id}` }
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    // An unparseable URL is not worth a failed page: the tile falls back to its glyph.
    return null
  }
}

/** From `GET /assets`, `GET /assets/{id}` and `POST /assets/get-bulk`. */
export const cloudAssetOfListing = cloudAssetOf

/**
 * From `POST /search/assets`, whose hits carry neither `kind` nor `properties`. The dimensions
 * are not lost with them: they are duplicated in `metadata` for anything generated, which is
 * what the reader falls back to.
 *
 * The missing thumbnail is filled in HERE rather than by each caller, for the same reason: it is
 * a property of the response shape, not of the errand. Two handlers remembered; `browse` did not,
 * and every text or tag search was still drawing its tiles from the originals.
 */
export function cloudAssetOfHit(value: unknown): CloudAsset | null {
  const asset = cloudAssetOf(value)
  return asset === null ? null : withPublicThumbnail(asset)
}
