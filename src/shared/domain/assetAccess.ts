import type { AssetLocation, AssetType, SyncStatus } from './assetTypes'

type AssetForUrl = {
  id: string
  type: AssetType
  location: AssetLocation
  localChangedAt?: string
  posterPath?: string
}

/** The kinds that decode as an image — the only ones a thumbnail or a texture slot can use. */
export const PICTURES: readonly AssetType[] = ['image', 'skybox']

/**
 * Whether this asset is a picture the studio can serve from disk. One answer to the question,
 * because a browser that draws a thumbnail and a texture slot that offers one must not disagree
 * about which assets qualify.
 *
 * The file is not named here: the main process resolves it from the id, for a still copied into
 * the project as much as for one linked where it lies — and the renderer is never told where
 * either sits (`withoutSourcePath`). A file gone missing answers 404, which every consumer of
 * `posterUrl` already falls back from.
 *
 * It lives beside `posterUrl` rather than in `asset.ts`, which republishes it: that one already
 * reads this module, so the answer written there and read here would be a cycle.
 */
export function isLocalPicture(asset: AssetForUrl): boolean {
  return PICTURES.includes(asset.type) && asset.location === 'local'
}

export const ASSET_PATHS_MAX = 2000

/**
 * The widest `limit` one `AssetQuery` may ask for. Read on both sides like `ASSET_PATHS_MAX`: the
 * main process REFUSES a larger one rather than trimming it, so a caller that cuts its reads into
 * batches has to know where the refusal starts.
 */
export const ASSET_SEARCH_LIMIT_MAX = 500

export type AssetQuery = {
  type?: AssetType
  /**
   * Several kinds at once — what a workspace asks for. The Image space wants pictures, textures
   * and skyboxes and nothing else; `type` alone could only ever name one of the three.
   */
  types?: readonly AssetType[]
  tags?: string[]
  text?: string
  /**
   * The asset filed at exactly this path, relative to the project — how the explorer asks
   * whether a file it is showing is one of ours.
   *
   * Exact, not a prefix: the question is « is this file an asset », and the folder walked by the
   * explorer spells its paths the way `relativePathFor` writes them — `/` on every platform.
   */
  path?: string
  /**
   * The same question for a whole listing — which of THESE files the catalogue holds a row for.
   *
   * One round trip rather than one per row: a browser showing four hundred files asked four
   * hundred times, and each answer is a query against the project's own database. An empty list
   * means nothing, as it does for `types`.
   *
   * Bounded by `ASSET_PATHS_MAX`, which the caller is the one to respect: a longer list is
   * REFUSED rather than cut, and a folder of rushes goes past it easily.
   */
  paths?: readonly string[]
  /**
   * Exactly these rows, by id — how a caller holding the output of a generation reads it back.
   *
   * `metadata.assetIds` is all a finished job hands over, and until this the catalogue could be
   * asked by path, by group and by origin but never by the one identifier the API itself
   * answers in. Empty means nothing, as it does for `paths`.
   */
  ids?: readonly string[]
  /**
   * Which of THESE library assets this project already holds — the question the remote browser
   * asks of every page it draws.
   *
   * Asked of the catalogue rather than answered from the rows a window happens to be holding:
   * that store pages the catalogue two hundred at a time, so a project with more than that would
   * have offered a download of a file already on the disk. Bounded by `ASSET_PATHS_MAX` and
   * empty means nothing, both exactly as `paths` above — one placeholder each in a statement the
   * main process builds.
   */
  remoteAssetIds?: readonly string[]
  /** Narrows to one side of the library, or to what still has to move between them. */
  location?: AssetLocation
  syncStatus?: SyncStatus
  /** The siblings of one generation — the seven channels of a PBR pack. */
  groupId?: string
  /**
   * What came OUT of one asset — the pictures taken out of a model's file above all.
   *
   * The column is already there and indexed; nothing asked it anything until a model's own
   * textures had to be shown beside it in the inspector.
   */
  derivedFrom?: string
  /**
   * What a model produced, as opposed to what was imported. Only ever asked for affirmatively:
   * "everything that was NOT generated" is a question no surface asks, and a branch nothing
   * reaches is a branch nothing tests.
   */
  generated?: true
  /**
   * Reaches what the STUDIO owns — the rows under `.resources/`, which no listing may show.
   *
   * 🛑 For a query that asks by PATH, which is what the install of a shipped resource does. Asking
   * by `ids` reaches them without this: an id is a capability, unguessable, held only by a document
   * that already names it. A path is composed by walking the disk — that is how the explorer would
   * have revealed them, and why it stays filtered.
   */
  hidden?: true
  /** Bounded by `ASSET_SEARCH_LIMIT_MAX`, past which the query is refused rather than cut. */
  limit?: number
  offset?: number
}

/**
 * How many assets of each kind a project holds. Every kind is present, zero included: a counter
 * that vanishes when it reaches nothing is a counter that reads as a bug rather than as a total.
 */
export type AssetCounts = Record<AssetType, number>

/**
 * A fresh tally at zero. A literal rather than built from `ASSET_TYPES`, so a kind added is a
 * compile error here instead of a counter silently missing from five hand-written copies.
 */
export function emptyAssetCounts(): AssetCounts {
  return { image: 0, video: 0, audio: 0, mesh: 0, skybox: 0, animation: 0 }
}

/**
 * What may be changed about an asset from the interface. An absent field is left alone, which is
 * what lets a rename and a retagging travel through the same channel without one erasing the
 * other — tags are replaced wholesale, so `[]` genuinely means « no tags ».
 */
export type AssetChanges = {
  name?: string
  tags?: readonly string[]
  /**
   * What the file IS, corrected by hand.
   *
   * The studio reads a file's domain from its extension alone, and an extension cannot always
   * tell: a normal map and an albedo are both PNGs. The row is what remembers the answer, which
   * is why only a file the catalogue holds can be corrected at all.
   */
  type?: AssetType
  modelMaterialIds?: readonly string[]
}

export const ASSET_SCHEME = 'ia-studio'
export const ASSET_HOST = 'asset'

/**
 * The original bytes, for an export that must not downsample a 4K H.264 take the monitor
 * plays through its proxy. Same scheme, different host, so the resolver cannot guess.
 */
export const MASTER_HOST = 'master'

/**
 * The host that serves an asset's still rather than the asset itself. A host of its own, and not
 * a parameter on `asset`: one id names one file per host, and a mesh's `.glb` and its `.jpg` are
 * two files — the resolver would otherwise have to guess which of them a caller meant.
 */
export const POSTER_HOST = 'poster'

/**
 * The host that serves a PREVIEW of a file in the project, named by its path rather than by an
 * id — the explorer shows files, and most of them have no catalogue row at all. What it hands
 * back is a small picture the main process rendered and kept under `.index/thumbnails`.
 */
export const THUMB_HOST = 'thumb'

/**
 * A file of the project by its relative PATH — what a loader reading a model's neighbours needs
 * as a base to resolve `textures/wood.png` against. Served for anything inside the project, the
 * hidden `.sources` folder included, since that is where an imported model's neighbours are kept.
 */
export const FILE_HOST = 'file'

/**
 * `ia-studio://<host>/<id>`. One scheme, one host per kind of thing it serves — the favourites
 * keep their stills outside any project, so they answer on a host of their own.
 */
export function hostedUrl(host: string, id: string): string {
  return `${ASSET_SCHEME}://${host}/${encodeURIComponent(id)}`
}

/**
 * Segment by segment rather than as one id: a loader appends `textures/wood.png` to the folder
 * url it was given, and the resolver reads the whole path back through `decodeURIComponent`.
 * Hand a folder with its trailing slash so that appending a name lands inside it.
 */
export function projectFileUrl(relativePath: string): string {
  const encoded = relativePath.split('/').map(encodeURIComponent).join('/')
  return `${ASSET_SCHEME}://${FILE_HOST}/${encoded}`
}

/** What a URL of the scheme names, or null when it is not one of ours. */
export function hostedParts(url: string): { host: string; id: string } | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${ASSET_SCHEME}:`) return null

    const id = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
    return id.length > 0 ? { host: parsed.hostname, id } : null
  } catch {
    return null
  }
}

/** The id back out, or null when the URL names another host — which is not ours to serve. */
export function hostedIdFromUrl(url: string, host: string): string | null {
  const parts = hostedParts(url)
  return parts?.host === host ? parts.id : null
}

/**
 * Where the renderer loads a local asset from. Derived from the identifier rather than asked
 * for over IPC: the answer is a pure function of the id, and asking would mean one round trip
 * and two synchronous SQLite queries per thumbnail on screen.
 *
 * The renderer still never handles a file path — the main process resolves the id against the
 * catalogue when it serves the scheme.
 */
export function assetUrl(assetId: string): string {
  return hostedUrl(ASSET_HOST, assetId)
}

export function assetMasterUrl(assetId: string): string {
  return hostedUrl(MASTER_HOST, assetId)
}

/**
 * What the explorer draws on the tile of a file it lists, asset or not.
 *
 * Keyed by the path and NOT versioned, which is the one thing to know about it: a file replaced
 * on disk outside the studio keeps the preview the window already decoded until that window
 * reloads. The cache on disk sees the change — it keys on the size and the stamp — but the URL
 * it answers is the same one, and nothing here can tell the browser to ask again.
 */
export function thumbnailUrl(relativePath: string): string {
  return hostedUrl(THUMB_HOST, relativePath)
}

/**
 * The still that stands for an asset — in a browser cell, on a timeline clip. A picture answers
 * for itself; anything else answers with the still recorded beside it, which today means a mesh
 * brought down from the library. A video has neither: its poster frame is produced at ingest,
 * which is still to come, and decoding one here would open a hardware decoder per visible clip.
 *
 * Stamped with `localChangedAt`, and that is what makes a REWRITTEN asset repaint: an id alone
 * is a stable URL, so a browser that already decoded it keeps the bitmap it holds and a ⌘S that
 * overwrote the file would look like a gesture that did nothing. The stamp rides in the query,
 * which the resolver never reads — it resolves the path.
 *
 * It lives HERE rather than on `assetUrl` because this is the one that knows the asset: a
 * version parameter on `assetUrl` would widen a pure function for its fourteen callers to serve
 * three, and `.map(assetUrl)` would then quietly pass the index as the version.
 */
export function posterUrl(asset: AssetForUrl): string | null {
  if (isLocalPicture(asset)) return versionedUrl(assetUrl(asset.id), asset.localChangedAt)
  // `local` said out loud rather than left to the fact that nothing writes a poster path on a
  // cloud row: the still is a file inside the open project, so a row from anywhere else would
  // send the window after a picture no resolver can answer for — a 404 where an icon belongs.
  if (asset.posterPath && asset.location === 'local') {
    return versionedUrl(hostedUrl(POSTER_HOST, asset.id), asset.localChangedAt)
  }
  return null
}

/**
 * The same URL, told apart from the one that named the file before it was overwritten.
 *
 * The version is `localChangedAt` at every call site: an id alone is a stable URL, so whoever
 * decoded it once — a browser cell, a WebGL texture cache — keeps the bitmap it holds, and a ⌘S
 * that rewrote the file looks like a gesture that did nothing.
 *
 * Apart from `posterUrl` because a texture slot has no `Asset` in hand, only an id and a stamp
 * looked up beside it. The resolver never reads the query; it resolves the path.
 */
export function versionedUrl(url: string, version: string | undefined): string {
  return version ? `${url}?v=${encodeURIComponent(version)}` : url
}

/** `ia-studio://asset/<id>` → `<id>`. Anything else is not ours to serve. */
export function assetIdFromUrl(url: string): string | null {
  return hostedIdFromUrl(url, ASSET_HOST)
}
