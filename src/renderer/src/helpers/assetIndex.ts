import type { Asset } from '@shared/domain/asset'
import { nameOf } from '@shared/domain/folder'
import {
  mediaNameOf,
  mediaPathOf,
  relinkedBySuffix,
  type MediaLink,
} from '@/engines/timeline/mediaLink'
import { assetsById, useAssets } from '@/stores/assets'

type AssetIndex = {
  byPath: ReadonlyMap<string, string>
  byName: ReadonlyMap<string, string>
}

let indexed: { of: ReadonlyMap<string, Asset>; index: AssetIndex } | null = null

/**
 * The catalogue turned the two ways a file NAME resolves back to a row — which is the direction no
 * store offers, every one of them being keyed by id.
 *
 * Built once per catalogue rather than once per document opened: every montage opened in a session
 * walked every asset the window had been shown, and that set only grows. Keyed on the map's
 * identity, which `assetsById` already memoises on the asset list, so this rebuilds exactly when
 * the catalogue changes and never otherwise.
 *
 * **The blind spot, written rather than hidden**: `assetsById` holds every asset this window has
 * been SHOWN, not the whole catalogue. A file whose row has never been listed here answers nothing.
 * Asking the catalogue by path (`helpers/assetAt`) is a round trip, and the readers that need this
 * — `DocumentIo.install` among them — are synchronous.
 */
function assetIndex(): AssetIndex {
  const assets = assetsById(useAssets.getState())
  if (indexed?.of === assets) return indexed.index

  const byPath = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const asset of assets.values()) {
    if (!asset.path) continue
    byPath.set(asset.path, asset.id)
    // First in wins: two folders may hold a `rush.mp4`, and answering the last read would make
    // the link depend on the order the catalogue happened to come back in.
    if (!byName.has(nameOf(asset.path))) byName.set(nameOf(asset.path), asset.id)
  }

  indexed = { of: assets, index: { byPath, byName } }
  return indexed.index
}

/**
 * The asset a file names by path, resolved the three ways in order: where the link actually points,
 * then the longest tail of it that names something here — a file from another machine — then the
 * file name alone. `''` for a link nothing answers.
 *
 * One resolver for every document that references a file by path: a montage's clips and a sky's
 * picture ask the same question, and two spellings of it would answer differently.
 */
export function assetIdForLink(link: MediaLink, documentFolder: readonly string[]): string {
  const { byPath, byName } = assetIndex()
  const path = mediaPathOf(link, documentFolder)

  return (
    (path === null ? undefined : byPath.get(path)) ??
    relinkedBySuffix(link, byPath) ??
    byName.get(mediaNameOf(link)) ??
    ''
  )
}
