import { localizedError } from '@shared/localizedError'
import { extname } from 'node:path'
import type { Asset } from '@shared/domain/asset'
import { UPLOAD_KIND_BY_TYPE, uploadMimeTypeOf, type UploadKind } from '@shared/domain/assetMime'
import type { CloudAsset } from '@shared/domain/cloudAsset'
import { channelFromProviderType } from '@shared/domain/material'
import { defined } from '@shared/guards'
import type { AsyncCatalog } from '@main/project/catalogClient'
import type { DownloadFormat, RemoteAssetCatalog } from '@main/provider/assetCatalog'
import { twinOf, type LocalBackend } from './localBackend'

/**
 * Sending a file the API cannot take in one request. Everything but a small picture goes this
 * way — a rush is gigabytes, and the base64 body tops out at six megabytes.
 */
type MultipartUpload = (params: {
  file: string
  fileName: string
  contentType: string
  kind: UploadKind
}) => Promise<{ assetId: string; updatedAt?: string; ownerId?: string }>

/** A picture small enough to travel as base64 — the path `uploader.ts` already opened. */
type SmallUpload = (name: string, base64: string) => Promise<string>

export type CloudBackendDeps = {
  remote: () => RemoteAssetCatalog
  multipart: MultipartUpload
  small: SmallUpload
  local: LocalBackend
  catalog: () => AsyncCatalog
  /**
   * The file an asset owns — `ownFileOf`, which contains the path inside the project and
   * refuses anything that escapes it. Injected rather than joined here: the catalogue is a file
   * a user can edit, and a row naming `../../.ssh/id_rsa` must not become an upload.
   */
  fileOf: (asset: Asset) => string | null
  readFile: (absolutePath: string) => Promise<Uint8Array>
  /** How big a file is, without reading it. Only asked when the catalogue does not know. */
  sizeOf: (absolutePath: string) => Promise<number>
  newId: () => string
  now: () => string
  /** Past this, base64 is refused and the multipart flow takes over. */
  smallUploadLimit: number
}

export type CloudBackend = {
  /** Brings a library asset into the project, bytes and all. */
  pull: (asset: CloudAsset) => Promise<Asset>
  /** Sends a local asset up, and records the twin it became. */
  push: (assetId: string) => Promise<Asset>
}

/**
 * The format to ask the CDN for on the way down.
 *
 * Meshes are converted to glb because that is the only thing the scene loads, and the CDN does
 * it for free — asking for the original would land an fbx nobody can open. Everything else comes
 * down as it is: re-encoding a picture would lose exactly what a studio is judging.
 */
function downloadFormatOf(asset: CloudAsset): DownloadFormat | undefined {
  return asset.type === 'mesh' ? 'glb' : undefined
}

/** Base64 carries three bytes in four characters. Measured before sending, never after. */
function base64Of(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

/**
 * Whether this one can travel as base64 in a single request.
 *
 * Sound and moving pictures never can — `POST /assets` takes an `image` field and nothing else,
 * so their size is not even worth asking for. For the rest the catalogue usually knows the size
 * already; a linked media whose row predates the column is the only case worth a `stat`, and it
 * is still cheaper than reading the file.
 */
async function fitsInOneRequest(
  asset: Asset,
  file: string,
  limit: number,
  sizeOf: (path: string) => Promise<number>,
): Promise<boolean> {
  if (asset.type === 'video' || asset.type === 'audio') return false

  const bytes = asset.bytes ?? (await sizeOf(file))
  return bytes <= limit
}

export function createCloudBackend({
  remote,
  multipart,
  small,
  local,
  catalog,
  fileOf,
  readFile,
  sizeOf,
  newId,
  now,
  smallUploadLimit,
}: CloudBackendDeps): CloudBackend {
  return {
    pull: async cloudAsset => {
      // Asked for again rather than reused: the URL an asset arrives with is signed and expires,
      // and a listing held for a minute already carries one that may not last the download.
      const url = await remote().downloadUrl(cloudAsset.id, downloadFormatOf(cloudAsset))

      // A twin already in the project is refreshed in place, not doubled: pulling twice must not
      // leave two rows pointing at one library asset, which is what `findByRemoteId` guards.
      const existing = await catalog().findByRemoteId(cloudAsset.id)
      const pulledChannel = channelFromProviderType(cloudAsset.remoteType)

      return await local.importFromUrl({
        id: existing?.id ?? newId(),
        url,
        name: cloudAsset.name,
        type: cloudAsset.type,
        remoteAssetId: cloudAsset.id,
        // What the library tile was already showing. Without it a mesh that was a picture in the
        // browser becomes an icon the moment it lands on disk.
        // The channel it holds, read off the provenance the library tile already carried. Without
        // it a picture pulled from the Library lands beside the photographs while its twin
        // generated in the app lands with the materials — one picture, two folders, on the door
        // it came through alone.
        ...(pulledChannel
          ? { map: pulledChannel.channel, mapInverted: pulledChannel.inverted }
          : {}),
        ...(cloudAsset.thumbnailUrl ? { thumbnailUrl: cloudAsset.thumbnailUrl } : {}),
        ...(cloudAsset.ownerId ? { remoteOwnerId: cloudAsset.ownerId } : {}),
        ...(cloudAsset.updatedAt ? { remoteUpdatedAt: cloudAsset.updatedAt } : {}),
        ...(cloudAsset.generation ? { generation: cloudAsset.generation } : {}),
      })
    },

    push: async assetId => {
      const asset = await catalog().find(assetId)
      if (!asset) throw localizedError('assetNotCatalogued', { name: assetId })

      // What is pushed is the file the project holds, or the media it links to. An asset that
      // lives only in the library has nothing to send.
      const absolutePath = fileOf(asset)
      if (!absolutePath) throw localizedError('assetFileMissing', { name: assetId })

      // The name becomes a file name on the way up; a separator in it would name another path.
      const fileName = `${asset.name.replace(/[/\\]/g, '-')}${extname(absolutePath)}`
      const contentType = uploadMimeTypeOf(absolutePath)
      // Refused here rather than after the transfer: the API validates the content type once the
      // whole file has arrived, which for a rush is minutes of upload spent to be told no.
      if (!contentType) throw localizedError('uploadFormatUnsupported', { name: fileName })

      // Decided BEFORE reading. The multipart helper takes a path and streams it itself, so
      // loading the file here would pull a two-gigabyte rush into the main process only to
      // throw it away — and `cloudPush` walks up to two hundred assets in a row.
      const twin = (await fitsInOneRequest(asset, absolutePath, smallUploadLimit, sizeOf))
        ? { assetId: await small(fileName, base64Of(await readFile(absolutePath))) }
        : await multipart({
            file: absolutePath,
            fileName,
            contentType,
            kind: UPLOAD_KIND_BY_TYPE[asset.type],
          })

      const at = now()
      // Through the same reader an import uses: which stamp is the baseline and which fields
      // are conditional is one definition, not two that must be changed together.
      const pushed: Asset = {
        ...asset,
        ...twinOf(
          {
            remoteAssetId: twin.assetId,
            ...defined({ remoteOwnerId: twin.ownerId, remoteUpdatedAt: twin.updatedAt }),
          },
          at,
        ),
      }
      // The error of a previous attempt goes with the success, or the badge keeps explaining a
      // failure that no longer happened.
      delete pushed.syncError

      return await catalog().add(pushed)
    },
  }
}
