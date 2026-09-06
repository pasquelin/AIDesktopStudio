import { FILE_NAME_MAX_LENGTH } from './fileName'
import type { FolderRole } from './folderRole'
import type { MaterialSettings, PbrChannel } from './material'
import type { MeshImportLoss } from './meshImport'
import type { ModelTextureUse } from './modelTextureUse'

import type { AssetLocation, AssetType, SyncStatus } from './assetTypes'
import { PICTURES } from './assetAccess'

export type { AssetLocation, AssetType, SyncStatus } from './assetTypes'
export type { ModelTextureUse } from './modelTextureUse'

/** The values, beside the type: a validator and a row reader both need to enumerate them. */
export const ASSET_TYPES: readonly AssetType[] = [
  'image',
  'video',
  'audio',
  'mesh',
  'skybox',
  'animation',
]

/**
 * A kind the API can be ASKED for. Every other list narrows to this one before a request.
 *
 * MEASURED: the API has no animation class at all — the Uthana file carrying a capoeira is filed
 * `kind: '3d'` there, beside the characters. A tab offering animations against the cloud would
 * therefore promise motion and list models, which is why this split exists rather than one list.
 */
export type CloudAssetType = Exclude<AssetType, 'animation'>

export const CLOUD_ASSET_TYPES: readonly CloudAssetType[] = ASSET_TYPES.filter(isCloudAssetType)

export function isCloudAssetType(type: AssetType): type is CloudAssetType {
  return type !== 'animation'
}

export function isAssetType(value: unknown): value is AssetType {
  return ASSET_TYPES.some(candidate => candidate === value)
}

/**
 * The role each kind is filed under when nothing says otherwise.
 *
 * A ROLE rather than a folder name: where the role sits is the user's business — renamed, moved,
 * nested — and only the marker inside the folder says which one it is. `DEFAULT_ROLE_PATHS` holds
 * the names a fresh project starts with.
 *
 * `Record<AssetType, FolderRole>` still makes a new kind a compile error rather than a surprise.
 *
 * A DEFAULT and nothing more, which is what made dropping `Textures` safe: a project that filed
 * pictures there keeps them — every row carries its own path — and only what it takes in from now
 * on lands with the rest.
 */
const ROLE_BY_ASSET_TYPE: Record<AssetType, FolderRole> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  mesh: 'models',
  skybox: 'skyboxes',
  animation: 'animations',
}

/**
 * The role an asset of this shape is filed under.
 *
 * A picture that serves a MATERIAL is filed with the materials rather than with the pictures. It
 * is still a picture — the kind says so, and every shelf that draws one draws this — but what a
 * person looks for it under is what it serves, and seven channels of one surface loose among the
 * photographs is a folder nobody can read.
 *
 * `packedSlot` answers beside `map` and must: a `metallicRoughnessTexture` packs two channels
 * into one image and claims neither, and it is the very picture the unpack gesture starts from —
 * leaving it behind files a model's maps over two folders.
 */
export function roleForAsset(asset: {
  type: AssetType
  map?: PbrChannel
  packedSlot?: string
}): FolderRole {
  const servesAMaterial = asset.map !== undefined || asset.packedSlot !== undefined

  return servesAMaterial ? 'materials' : ROLE_BY_ASSET_TYPE[asset.type]
}

/**
 * What every asset id starts with, ours and Scenario's alike — the two vocabularies share the
 * spelling and nothing else. Written down because the main process reads it to tell a value that
 * may name an asset from one that cannot, before asking the catalogue about it.
 */
export const ASSET_ID_PREFIX = 'asset_'

/**
 * How a local asset stands against the twin it has in the library, when it has one.
 *
 * Separate from `location`, which answers a different question: `location` says whether the
 * bytes are here, this says whether the two sides agree. An asset can be local and ahead, local
 * and behind, or local with no twin at all, and one field could not tell those apart.
 *
 * The studio only ever writes `none`, `synced`, `local-ahead` and `error` today — pushing and
 * pulling are explicit, so nothing drifts behind our back. `remote-ahead` and `conflict` are
 * declared because the timestamps that decide them are already recorded: the day the plan is
 * computed from a full diff rather than from a selection, that is a change of policy in
 * `planSync`, not a migration.
 */
export const SYNC_STATUSES: readonly SyncStatus[] = [
  'none',
  'synced',
  'local-ahead',
  'remote-ahead',
  'conflict',
  'error',
]

export function isSyncStatus(value: unknown): value is SyncStatus {
  return SYNC_STATUSES.some(candidate => candidate === value)
}

/**
 * Peak pairs per second in the waveform written at ingest. Shared because it is the contract
 * between the process that writes the file and the one that paints it: a mismatch would not
 * fail, it would draw the right shape at the wrong speed.
 */
export const PEAKS_PER_SECOND = 50

/**
 * How long an asset's name may be.
 *
 * Shared rather than repeated at each boundary: the rename channel has always refused more, and
 * a name written straight into the catalogue — as automatic captioning does — must be held to
 * the same rule. A caption is a sentence, and a row whose name is a paragraph is unreadable in
 * every list that shows it.
 *
 * It IS the file name's bound, and not a bound of its own, since the name reached the file:
 * a catalogue holding 200 characters over a file cut at 80 is the two-name problem back, one
 * layer down — the shelf would read one thing and the explorer another, which is exactly what
 * `assetFileName` exists to stop.
 */
export const ASSET_NAME_MAX_LENGTH = FILE_NAME_MAX_LENGTH

/** What probing a media file tells us. Durations are microseconds, like the timeline. */
export type MediaProbe = {
  duration: number
  codec: string
  width?: number
  height?: number
  fps?: number
  sampleRate?: number
  channels?: number
}

/**
 * How an asset was produced — what lets the inspector offer to run it again, and what ties a
 * texture back to the prompt that made it.
 *
 * The API is the source of truth here, not the job: a job carries neither `modelId` nor
 * `prompt` at its top level — only an untyped `metadata.input` — while every asset it produces
 * carries both. Reading it off the asset is what makes provenance survive the session that
 * generated it.
 */
export type AssetGeneration = {
  modelId: string
  /** What the model is called, as the panel shows it — « ElevenLabs Music v2 ». */
  modelLabel: string
  prompt: string
  params: Record<string, unknown>
  seed?: number
}

/**
 * A probe from values its reader has already narrowed — ffprobe output on the way in, a
 * catalogue column on the way back. One list of optional fields rather than two: a probe that
 * gains a field must not be able to survive the ingest and vanish on the next read.
 *
 * Without a duration and a codec there is no probe: a clip built on one would have no length.
 */
export function mediaProbeOf(fields: Partial<MediaProbe>): MediaProbe | null {
  const { duration, codec, ...rest } = fields
  return duration === undefined || codec === undefined ? null : { duration, codec, ...rest }
}

/** ffprobe prints its numbers as strings, the catalogue stores them as numbers. Both here. */
export function probeNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export type Asset = {
  id: string
  name: string
  type: AssetType
  location: AssetLocation
  /** Path relative to the project folder when `location` is `local`. */
  path?: string
  /** Originating Scenario identifier, when the asset comes from a generation. */
  remoteAssetId?: string
  /**
   * The project that holds the twin — `asset.ownerId`, a `proj_…`.
   *
   * An API key carries its own project, so switching accounts changes what `remoteAssetId`
   * even refers to. Without this, an asset pushed under one key would read as « synchronised »
   * under another, against a library that has never heard of it.
   */
  remoteOwnerId?: string
  /** The API's `updatedAt` for the twin. One of the three stamps a sync plan compares. */
  remoteUpdatedAt?: string
  /** When the two sides were last reconciled — the baseline both stamps are measured against. */
  remoteSyncedAt?: string
  /** When this row or its file last moved here. */
  localChangedAt?: string
  syncStatus?: SyncStatus
  /** Why the last sync failed, so the badge can say more than « something went wrong ». */
  syncError?: string
  jobId?: string
  width?: number
  height?: number
  bytes?: number
  tags: string[]
  createdAt: string
  /** Asset this one derives from — lets us trace a texture back to its source image. */
  derivedFrom?: string
  /**
   * What ties the outputs of one generation together — the seven channels of a PBR pack above
   * all. The API has no notion of a group: it answers with siblings that share a `parentId`, a
   * `parentJobId` and nothing else, and dropping a whole material onto the materials space means
   * being able to name the set.
   */
  groupId?: string
  /** Position within that group — `metadata.outputIndex`. Orders the siblings the same way twice. */
  outputIndex?: number
  /**
   * Which PBR channel this asset holds, when it holds one. Named `map` rather than `channel`
   * because `probe.channels` already means audio channels, two fields apart.
   *
   * A texture is a set of channels, and Scenario returns each as an asset of its own: seven
   * siblings under one `derivedFrom` are indistinguishable without this.
   */
  map?: PbrChannel
  /** Set when the pixels read the other way round — a smoothness map stored as roughness. */
  mapInverted?: boolean
  /**
   * The glTF slot an extracted picture came out of, when `map` cannot name it — a
   * `metallicRoughnessTexture` packs two channels into one image, a `clearcoatTexture` names one
   * the studio has no channel for. Without it the two are indistinguishable, and offering to
   * unpack either would write a roughness out of a coat.
   */
  packedSlot?: string
  /** glTF material uses retained so an interrupted extraction can resume without the source maps. */
  modelTextureUses?: readonly ModelTextureUse[]
  /** Per-channel UV transform carried into an assembled material during model extraction. */
  textureTransform?: Pick<MaterialSettings, 'tiling' | 'offset' | 'rotation'>
  textureSampling?: ModelTextureUse['sampling']
  /** Default editable materials replacing images extracted from this model file. */
  modelMaterialIds?: readonly string[]
  /**
   * Absolute path of a linked external media. A twenty-minute 4K rush is twenty gigabytes: it
   * is linked, never copied into the project, which is why `hash` exists to relink it.
   */
  sourcePath?: string
  /** Content hash — deduplication, cache key, and relink when a folder moves. */
  hash?: string
  probe?: MediaProbe
  /** H.264 720p stand-in, relative to the project folder. */
  proxyPath?: string
  /** Precomputed waveform, relative to the project folder. */
  peaksPath?: string
  /**
   * A still standing for an asset that is not itself a picture — a mesh above all, whose file no
   * browser can decode. Relative to the project folder, and rebuildable: it is the library's own
   * thumbnail, brought down beside the bytes rather than kept only in a listing that expires.
   *
   * Without it a downloaded model is an icon in a grid it was a picture in one gesture earlier,
   * which is exactly how "the thumbnail disappears when I download" was reported.
   */
  posterPath?: string
  /** Absent for an imported file, and for a generated one the catalogue predates. */
  generation?: AssetGeneration
  /**
   * The 3D file this `.glb` was converted from, kept beside it and out of the catalogue —
   * relative to the project folder. Set once, by the conversion; its presence is what says
   * « already converted » to whoever reads arrivals.
   */
  convertedFrom?: string
  /** What that conversion could not carry, measured while converting. Empty when it carried all. */
  importLosses?: readonly MeshImportLoss[]
}

/**
 * What the browser paints in the corner of a cell. One name per state the user can act on.
 *
 * Most of them describe a row the catalogue holds. Two stand for a line it does NOT — a library
 * asset and a running generation — and that is deliberate: the browser lists both alongside what
 * is on disk, so the vocabulary that says WHERE a thing is has to reach what is not here yet.
 *
 * The count is left out of this sentence on purpose: it went stale twice in one afternoon, and
 * `exhaustive.test.ts` is what actually holds the list to the union.
 */
export type AssetBadge =
  | 'local-only'
  | 'synced'
  | 'to-push'
  | 'to-pull'
  | 'conflict'
  | 'error'
  | 'other-account'
  /** In the account's library, with no copy on this disk. Nothing local answers for it. */
  | 'remote-only'
  /**
   * Published by somebody else — the public feed, which this account owns nothing of. It behaves
   * exactly as `remote-only` does (no file here, fetched by a double-click or by a drop) and it
   * is a mark of its own for the one thing that differs: whose it is.
   */
  | 'published'
  /** A job is still running. The row stands for an output that does not exist yet. */
  | 'generating'
  /** Its bytes are on their way down right now. Transient, and never read off a stored row. */
  | 'fetching'
  /** The catalogue records a file the disk no longer has — deleted or moved outside the studio. */
  | 'missing'

/**
 * Whether this asset's twin lives in a project the active key does not open onto.
 *
 * Shared by the badge and by the sync planner, which is the point: the tile saying "in sync"
 * while the plan says "skipped, other account" is a disagreement nothing would have caught.
 *
 * A `null` account means nothing has said which project is open yet — judged as "do not judge"
 * rather than as a mismatch, since guessing would strand every asset behind a false warning.
 */
export function isForeignTwin(
  twin: Pick<Asset, 'remoteOwnerId'>,
  activeOwnerId: string | null,
): boolean {
  return (
    activeOwnerId !== null &&
    twin.remoteOwnerId !== undefined &&
    twin.remoteOwnerId !== activeOwnerId
  )
}

/**
 * Whether a stamp is later than the baseline.
 *
 * Parsed rather than compared as text: both stamps are ISO today, but one comes from the API and
 * one from us, and a string comparison would quietly give the wrong answer the day one of them
 * carries an offset instead of a Z. An unreadable stamp counts as "not moved" — refusing to act
 * on a date nobody can read beats pushing over a file on the strength of it.
 *
 * Beside `isForeignTwin` because the two answer the halves of one question — is the twin this
 * asset records still the one the API would serve — and are read by the badge, by the sync
 * planner and by what translates a body before a job runs.
 */
export function movedSince(stamp: string | undefined, baseline: string | undefined): boolean {
  if (stamp === undefined) return false
  if (baseline === undefined) return true

  const at = Date.parse(stamp)
  const since = Date.parse(baseline)
  return Number.isNaN(at) || Number.isNaN(since) ? false : at > since
}

export const ASSET_BADGES: readonly AssetBadge[] = [
  'local-only',
  'synced',
  'to-push',
  'to-pull',
  'conflict',
  'error',
  'other-account',
  'remote-only',
  'published',
  'generating',
  'fetching',
  'missing',
]

/**
 * The badge an asset wears, derived rather than stored: it depends on which account is active,
 * and the catalogue outlives the choice of account. Storing it would mean rewriting every row
 * on every key change — and showing a stale answer between the change and the rewrite.
 *
 * `activeOwnerId` is the project the current key opens onto. An asset whose twin lives in
 * another project is shown for what it is instead of being hidden: the file is still here, it
 * is only the library on the other end that has changed.
 */
export function assetBadgeOf(asset: Asset, activeOwnerId: string | null): AssetBadge {
  if (asset.remoteAssetId === undefined) return 'local-only'
  if (isForeignTwin(asset, activeOwnerId)) return 'other-account'

  switch (asset.syncStatus) {
    case 'synced':
      return 'synced'
    case 'local-ahead':
      return 'to-push'
    case 'remote-ahead':
      return 'to-pull'
    case 'conflict':
      return 'conflict'
    case 'error':
      return 'error'
    default:
      // Provenance, not a twin: a generation lands a file so a resume does not download twice.
      return 'local-only'
  }
}

/**
 * An asset as the renderer may see it: without the absolute path of the file behind it.
 *
 * The renderer has no filesystem, so a path there is only ever text on screen — and handing it
 * every user's folder layout buys nothing while widening what a compromised dependency in the
 * window could read (CLAUDE.md, invariant 1). What one actually does with a path — show the
 * file in the Finder — is a main-process errand, `assets:reveal`.
 */
export function withoutSourcePath(asset: Asset): Asset {
  if (asset.sourcePath === undefined) return asset

  const rest = { ...asset }
  delete rest.sourcePath
  return rest
}

/**
 * How long the media itself runs, or null when it has no length of its own. A still picture
 * probes as `duration: 0` — a real value, not a missing one — and an asset nobody has probed
 * yet has no probe at all. Both are timeless, and both must reach a caller as the same answer.
 */
export function mediaDuration(asset: Asset | null): number | null {
  const duration = asset?.probe?.duration
  return duration !== undefined && duration > 0 ? duration : null
}

/**
 * Whether the media has no length of its own — a picture, however it was generated. Not the same
 * question as `mediaDuration` answering null, which also covers an asset nobody has probed yet:
 * that one has a source whose length is merely unknown, and an edit treating the two alike would
 * run a clip off the end of its own rush. A trim needs them apart; a drop does not.
 */
export function isTimeless(asset: Asset | null): boolean {
  return asset !== null && PICTURES.includes(asset.type)
}

/**
 * The kinds whose own file no surface can paint, and which therefore get a still of their own.
 *
 * A picture answers for itself. A sound must NOT be given one: a timeline clip reads `posterUrl`
 * like every other surface, and the still would be painted under its waveform. What is left is
 * a mesh — nothing decodes a `.glb` — and a rush, whose first frame is the only thing that tells
 * one take from another in a shelf of grey rectangles.
 *
 * Here rather than beside either producer: a still comes down with a generated asset and is
 * grabbed by ffmpeg for an imported one, and the two must not answer this differently.
 */
export const POSTER_KINDS: readonly AssetType[] = ['mesh', 'video']

export function wantsPoster(type: AssetType): boolean {
  return POSTER_KINDS.includes(type)
}

/**
 * Whether the media carries a sound of its own. `channels` is only ever written when ffprobe
 * found an audio stream, so its absence is the answer — for a silent rush AND for one nobody
 * has probed, which a montage must treat alike: there is no sound it could lay down either way.
 */
export function hasSound(asset: Asset | null): boolean {
  return (asset?.probe?.channels ?? 0) > 0
}

/** How many paths one `AssetQuery` may ask about.
 * Read on BOTH sides, which is the whole point: the main process refuses a longer list — one
 * placeholder each in a statement it builds — and the caller cuts its question into that many
 * before asking. Written on one side only, a project of three thousand rushes lost every
 * catalogue answer at once and fell back to guessing from extensions, silently.
 */
export {
  ASSET_HOST,
  ASSET_PATHS_MAX,
  PICTURES,
  ASSET_SCHEME,
  ASSET_SEARCH_LIMIT_MAX,
  MASTER_HOST,
  POSTER_HOST,
  THUMB_HOST,
  assetIdFromUrl,
  assetMasterUrl,
  assetUrl,
  emptyAssetCounts,
  hostedIdFromUrl,
  hostedParts,
  hostedUrl,
  isLocalPicture,
  posterUrl,
  thumbnailUrl,
  versionedUrl,
  type AssetChanges,
  type AssetCounts,
  type AssetQuery,
} from './assetAccess'
