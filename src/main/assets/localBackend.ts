import { copyFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import {
  roleForAsset,
  wantsPoster,
  type Asset,
  type AssetGeneration,
  type AssetType,
  type MediaProbe,
} from '@shared/domain/asset'
import type { FolderRole } from '@shared/domain/folderRole'
import { POSTERS_FOLDER, resourceFolderOf } from '@shared/domain/project'
import type { PbrChannel } from '@shared/domain/material'
import type { ModelTextureUse } from '@shared/domain/modelTextureUse'
import type { AsyncCatalog } from '@main/project/catalogClient'
import { log } from '@main/log'
import { freeAnimationPath, freeAssetPath, safeExtension, withExtension } from './assetFile'

export type Download = (url: string) => Promise<Uint8Array>

export type LocalBackendDeps = {
  download: Download
  projectPath: () => string
  /**
   * Where an asset of this role lands — `ProjectStore.folderFor`. Asked rather than composed: a
   * project whose `Modelling/Models` was renamed in the Finder goes on filing meshes there.
   */
  folderFor: (role: FolderRole) => Promise<string>
  catalog: () => AsyncCatalog
  now: () => string
  /**
   * The fingerprint of a file the project now holds — `null` when it cannot be read.
   *
   * The SAME one the rescan computes, and that is the whole point of asking for it here: a row
   * with no fingerprint cannot be followed when its file moves, and everything that arrives
   * through this door — a generation collected, a twin pulled — used to arrive without one.
   * Only a file picked off a disk was ever fingerprinted, by the ingest.
   */
  hash: (path: string) => Promise<string | null>
  /**
   * Reads a written file back for its length and its tracks — `null` when the tool is missing
   * or the file says nothing.
   *
   * A generation carries no length with its bytes: the API states none, and a clip laid down
   * without one is given an arbitrary five seconds and no way to know whether it even has a
   * sound. Read here rather than at the drop, which has no ffprobe and no file path either.
   */
  probeFile?: (path: string) => Promise<MediaProbe | null>
  /**
   * What has just landed in the project, once the catalogue holds it.
   *
   * The one hook here, and it exists because this is the single door every asset comes through:
   * a download, a generation collected, a picture saved — whoever wants to act on an arrival
   * would otherwise have to catch it at each of them, and would miss the next one added.
   *
   * NOT awaited: an import must not wait on what somebody does afterwards, and a listener that
   * throws must not cost the asset. Whatever it starts is its own to see through.
   */
  onImported?: (asset: Asset) => void
}

export type ImportRequest = {
  id: string
  url: string
  name: string
  type: AssetType
  jobId?: string
  remoteAssetId?: string
  /** The project the twin belongs to — an API key opens onto one, and keys can be swapped. */
  remoteOwnerId?: string
  remoteUpdatedAt?: string
  /**
   * False for a generation: the remote id is provenance so a resume does not download twice.
   * A pull from the library leaves this unset, which is a twin and counts as synced.
   */
  sync?: false
  derivedFrom?: string
  /** What ties the outputs of one generation together — the seven channels of a PBR pack. */
  groupId?: string
  outputIndex?: number
  /** The model, prompt and parameters behind it, read off the API asset rather than the job. */
  generation?: AssetGeneration
  map?: PbrChannel
  mapInverted?: boolean
  /** The glTF slot of an extracted packed or extension map no PBR channel names exactly. */
  packedSlot?: string
  modelTextureUses?: readonly ModelTextureUse[]
  /**
   * The library's own still for this asset. Brought down for the kinds no browser can decode —
   * a mesh — so a tile that was a picture in the library stays one once the file is here.
   */
  thumbnailUrl?: string
}

/** An import whose bytes the caller already holds — an edited take, rather than a download. */
export type WriteRequest = Omit<ImportRequest, 'url'> & {
  extension: string
  /** Overrides filing without changing what kind of asset the catalogue records. */
  folderRole?: FolderRole
  /**
   * Files this under `.resources/` — what the APP ships, which no surface that browses assets
   * lists. 🛑 A FLAG, never a path: a folder reaching this from a request would write outside the
   * project on its first `../`.
   */
  resource?: true
  /** What the bytes say about themselves, when the caller could read it. */
  probe?: MediaProbe
}

export type LocalBackend = {
  importFromUrl: (request: ImportRequest) => Promise<Asset>
  importFromBytes: (request: WriteRequest, bytes: Uint8Array) => Promise<Asset>
  /**
   * The same import, for bytes that are ALREADY a file on this machine — what a local generation
   * leaves behind. Moved rather than read and written back: a video or a panorama would otherwise
   * cross the main process's heap whole, twice. The source is gone on success; a move across
   * volumes falls back to a copy, and then it is the caller's to discard.
   */
  importFromFile: (request: WriteRequest, sourcePath: string) => Promise<Asset>
  /**
   * Overwrites an asset's file, keeping its id, its name and its place in the catalogue. What
   * "apply" means in the audio editor: the same asset, edited. The extension follows the bytes,
   * so a take re-encoded on the way out is not left claiming to be what it no longer is.
   */
  replaceBytes: (
    assetId: string,
    bytes: Uint8Array,
    extension: string,
    probe?: MediaProbe,
  ) => Promise<Asset>
}

/**
 * A URL carries a name, and a name carries whatever the API put in it. Only the extension is
 * kept, and only if it looks like one — the file name itself comes from the asset's own name.
 */
export function extensionFromUrl(url: string, type: AssetType): string {
  try {
    return safeExtension(extname(new URL(url).pathname), type)
  } catch {
    return safeExtension('', type)
  }
}

/** A library pull is a twin (`synced`). A generation (`sync: false`) keeps the remote id and stamp. */
export function twinOf(
  request: Pick<ImportRequest, 'remoteAssetId' | 'remoteOwnerId' | 'remoteUpdatedAt' | 'sync'>,
  at: string,
): Partial<Asset> {
  if (!request.remoteAssetId) return {}

  return {
    remoteAssetId: request.remoteAssetId,
    remoteSyncedAt: at,
    ...(request.remoteOwnerId ? { remoteOwnerId: request.remoteOwnerId } : {}),
    ...(request.remoteUpdatedAt ? { remoteUpdatedAt: request.remoteUpdatedAt } : {}),
    ...(request.sync === false ? {} : { syncStatus: 'synced' }),
  }
}

type WrittenAsset = {
  request: WriteRequest
  existing: Asset | null
  name: string
  relativePath: string
  byteLength: number
  at: string
  fingerprint?: string | null
  probe?: MediaProbe
  posterPath?: string
}

type WriteSource = { bytes: Uint8Array } | { from: string }

const sourceLength = async (source: WriteSource, absolute: string): Promise<number> =>
  'bytes' in source ? source.bytes.byteLength : (await stat(absolute)).size

function writtenAssetOf(input: WrittenAsset): Asset {
  const { request, existing, name, relativePath, byteLength, at, fingerprint, probe, posterPath } =
    input
  return {
    ...existing,
    id: request.id,
    name,
    type: request.type,
    location: 'local',
    path: relativePath,
    bytes: byteLength,
    tags: existing?.tags ?? [],
    createdAt: existing?.createdAt ?? at,
    localChangedAt: at,
    ...(fingerprint ? { hash: fingerprint } : {}),
    ...(probe ? { probe } : {}),
    ...(posterPath ? { posterPath } : {}),
    ...(request.jobId ? { jobId: request.jobId } : {}),
    ...requestMetadata(request),
    ...twinOf(request, at),
  }
}

function requestMetadata(request: Omit<ImportRequest, 'url'>): Partial<Asset> {
  return {
    ...(request.derivedFrom ? { derivedFrom: request.derivedFrom } : {}),
    ...(request.groupId ? { groupId: request.groupId } : {}),
    ...(request.outputIndex !== undefined ? { outputIndex: request.outputIndex } : {}),
    ...(request.generation ? { generation: request.generation } : {}),
    ...(request.map
      ? { map: request.map, ...(request.mapInverted ? { mapInverted: true } : {}) }
      : {}),
    ...(request.packedSlot ? { packedSlot: request.packedSlot } : {}),
    ...(request.modelTextureUses ? { modelTextureUses: request.modelTextureUses } : {}),
  }
}

function replacementAsset(
  existing: Asset,
  relativePath: string,
  bytes: Uint8Array,
  at: string,
  probe?: MediaProbe,
): Asset {
  const rewritten: Asset = {
    ...existing,
    path: relativePath,
    bytes: bytes.byteLength,
    localChangedAt: at,
    ...(existing.remoteAssetId ? { syncStatus: 'local-ahead' } : {}),
    ...(probe ? { probe } : {}),
  }
  delete rewritten.peaksPath
  return rewritten
}

/**
 * Brings a generated asset down to disk and indexes it. The disk is the truth: scrubbing a
 * video and loading a mesh must never depend on the network — see spec § 5.
 */
export function createLocalBackend({
  download,
  projectPath,
  folderFor,
  catalog,
  now,
  hash,
  probeFile,
  onImported,
}: LocalBackendDeps): LocalBackend {
  /**
   * What the bytes say about themselves, read off the file that was just written.
   *
   * Only for the two kinds that run in time, and only when the caller could not say: an editor
   * applying an edit already knows, and a picture has nothing to time. Best effort, like the
   * poster beside it — a missing ffprobe leaves the asset exactly as it was before.
   */
  const probeWritten = async (
    request: WriteRequest,
    relativePath: string,
  ): Promise<MediaProbe | undefined> => {
    if (request.probe) return request.probe
    if (!probeFile || (request.type !== 'video' && request.type !== 'audio')) return undefined

    try {
      return (await probeFile(join(projectPath(), relativePath))) ?? undefined
    } catch {
      return undefined
    }
  }

  /**
   * The library's still, brought down beside the bytes — for the kinds `wantsPoster` names.
   *
   * Best effort, and that is the whole design: the thumbnail is a convenience, the model is the
   * asset. A CDN that answers 404 must leave the import that carries it untouched.
   */
  const savePoster = async (request: WriteRequest): Promise<string | undefined> => {
    if (!request.thumbnailUrl || !wantsPoster(request.type)) return undefined

    try {
      const poster = await download(request.thumbnailUrl)
      const relative = `${POSTERS_FOLDER}/${request.id}${extensionFromUrl(request.thumbnailUrl, 'image')}`
      await writeFile(join(projectPath(), relative), poster)
      return relative
    } catch (error: unknown) {
      // Said out loud, though the import carries on: this is the one way an asset that WAS a
      // picture in the browser lands as an icon, and it left no trace of any kind. A second pull
      // repairs it — nothing else does, and nothing else asks.
      log.warn('assets', `no still for ${request.id}: ${String(error)}`)
      return undefined
    }
  }

  /** `rename` first: a copy of a panorama is megabytes of I/O the same volume never needs. */
  const place = async (source: WriteSource, absolute: string): Promise<void> => {
    if ('bytes' in source) return await writeFile(absolute, source.bytes)

    try {
      await rename(source.from, absolute)
    } catch {
      // Across volumes `rename` refuses (EXDEV), and the studio's temporary folder and the
      // project can sit on different ones. The source is left for its owner to discard.
      await copyFile(source.from, absolute)
    }
  }

  const writePath = async (
    request: WriteRequest,
    existing: Asset | null,
    name: string,
  ): Promise<string> => {
    const extension = safeExtension(request.extension, request.type)
    if (existing?.path) return withExtension(existing.path, extension)

    const role = request.folderRole ?? roleForAsset(request)
    const folder = request.resource ? resourceFolderOf(role) : await folderFor(role)
    if (request.type === 'animation')
      return freeAnimationPath(projectPath(), folder, name, extension)
    return freeAssetPath(projectPath(), folder, name, extension)
  }

  const removeReplacedPoster = async (
    existing: Asset | null,
    posterPath?: string,
  ): Promise<void> => {
    if (posterPath && existing?.posterPath && existing.posterPath !== posterPath)
      await rm(join(projectPath(), existing.posterPath), { force: true })
  }

  const addWritten = async (input: WrittenAsset): Promise<Asset> =>
    announce(await catalog().add(writtenAssetOf(input)))

  const write = async (request: WriteRequest, source: WriteSource): Promise<Asset> => {
    // Read BEFORE the write, where it used to run beside it: the file is named after the row
    // now, so where the bytes go depends on what this id already has. Pulling a twin a second
    // time must land on the file it landed on the first — not beside it, under a suffixed name.
    //
    // What the row already held survives being written again: rebuilding the asset from the
    // request alone dropped the tags the user had put on it and moved its creation date to now,
    // which also sent it back to the top of a shelf sorted newest first, for a file that had
    // not changed.
    // Started before the catalogue is asked anything, and awaited at the end: it is a second
    // download over the network and it reads nothing of the row — leaving it behind the read
    // below would put its whole latency in series for no reason. It resolves `undefined` rather
    // than rejecting, so nothing can be left unhandled while it floats.
    const poster = savePoster(request)

    const existing = await catalog().find(request.id)
    // The name the ROW carries wins over the request's: a second pull of an asset the user has
    // since renamed must not put the API's wording back — neither on their disk NOR in their
    // catalogue, and writing `request.name` here while the file took the other one is the two
    // names apart again, in the opposite direction.
    const name = existing?.name ?? request.name

    const relativePath = await writePath(request, existing, name)

    // The probe spawns ffprobe, so it runs beside the still rather than after it.
    const absolute = join(projectPath(), relativePath)
    const written = place(source, absolute)
    const [posterPath, probe, fingerprint, byteLength] = await Promise.all([
      poster,
      // After the write, and only after it: these three read the file that was just laid down.
      written.then(() => probeWritten(request, relativePath)),
      written.then(() => hash(absolute)),
      written.then(() => sourceLength(source, absolute)),
    ])

    // The still's name follows the extension the CDN's URL carried, and a second pull of the
    // same twin can carry another one. The file the row stops pointing at is ours and nothing
    // would ever come back for it — the same reason `replaceBytes` drops the file it replaces.
    await removeReplacedPoster(existing, posterPath)

    return addWritten({
      request,
      existing,
      name,
      relativePath,
      byteLength,
      at: now(),
      fingerprint,
      probe,
      posterPath,
    })
  }

  /**
   * Tells whoever derives files from an asset that its bytes are on disk.
   *
   * After the catalogue, never before: a listener that goes looking for what just arrived —
   * extracting a model's pictures does exactly that — would find nothing at all. Caught, as the
   * deps promise: the row is committed by now, so a listener throwing here would fail a write
   * that has already happened.
   */
  const announce = (asset: Asset): Asset => {
    try {
      onImported?.(asset)
    } catch {
      // Nothing to say from here: what a listener does is its own errand, and the one this
      // exists for reports its own failures to the journal.
    }
    return asset
  }

  const replacementPath = async (existing: Asset, extension: string): Promise<string> => {
    const safe = safeExtension(extension, existing.type)
    return existing.path
      ? withExtension(existing.path, safe)
      : freeAssetPath(projectPath(), await folderFor(roleForAsset(existing)), existing.name, safe)
  }

  return {
    importFromUrl: async request =>
      write(
        { ...request, extension: extensionFromUrl(request.url, request.type) },
        {
          bytes: await download(request.url),
        },
      ),

    importFromBytes: (request, bytes) => write(request, { bytes }),

    importFromFile: (request, sourcePath) => write(request, { from: sourcePath }),

    replaceBytes: async (assetId, bytes, extension, probe) => {
      const existing = await catalog().find(assetId)
      if (!existing) throw new Error(`asset ${assetId} is not in the catalogue`)

      // Written INSIDE the project, always — including for a row that had no file there.
      //
      // A linked asset keeps its bytes where the user left them and `path` empty on purpose
      // (`linkedAsset` says so). Editing one used to be refused outright; it now lands in the
      // project and the row gains its `path`, so the shelf, the scene and every other reader
      // show the edit. The file that was linked is NOT touched: the studio writing into a
      // folder the user only pointed at is a different act from editing an asset, and the one
      // guard that keeps every other write inside the project — `assetFilePath` — exists
      // precisely because a catalogue row is user-editable territory.
      // The stem the file already has, so that applying an edit is not also a rename: a take
      // imported before names reached the disk keeps its id there until somebody renames it,
      // which is the one gesture that moves a file.
      const relativePath = await replacementPath(existing, extension)

      const absolute = join(projectPath(), relativePath)
      await writeFile(absolute, bytes)
      const fingerprint = await hash(absolute)

      // The extension follows the bytes: an edited take goes back as a `.wav`, and leaving it
      // under the `.mp3` it was imported as would hand every reader a file that lies. Only a
      // file the PROJECT held is removed — a linked one is not ours to delete.
      if (existing.path && relativePath !== existing.path) {
        await rm(join(projectPath(), existing.path), { force: true })
      }

      // Through `add`, which upserts: the row keeps its id, its tags and its job, and only what
      // the new bytes changed is rewritten.
      //
      // `peaksPath` goes, always: the waveform on disk describes the take before the edit, and
      // a stale one is worse than none — the strip would draw a shape the ear no longer hears.
      // A fresh one is derived from the new bytes below, on the same path every other write
      // takes. Nothing used to do that, and applying an edit left every clip of the take
      // waveform-less for good.
      const rewritten = replacementAsset(existing, relativePath, bytes, now(), probe)

      // The fingerprint follows the bytes for the same reason the waveform does: the one the row
      // carried describes a take that no longer exists, so a rescan would hunt for a file nobody
      // can produce, and a fresh import of the ORIGINAL bytes would be called a duplicate of this
      // row. Dropped rather than kept when it cannot be recomputed.
      if (fingerprint) rewritten.hash = fingerprint
      else delete rewritten.hash

      return announce(await catalog().add(rewritten))
    },
  }
}
